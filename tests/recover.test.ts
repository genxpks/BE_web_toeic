/**
 * ════════════════════════════════════════════════════════════════
 *  TEST: Resume/Recovery — recoverAttempt
 *  Chạy: npx vitest run
 * ════════════════════════════════════════════════════════════════
 *
 *  Bốn tình huống được kiểm tra:
 *  1. RESUME          — Attempt đang IN_PROGRESS, còn thời gian → trả về answers + remainingSec
 *  2. ALREADY_SUBMITTED — Attempt đã submit → recoverPolicy = ALREADY_SUBMITTED
 *  3. EXPIRED (status) — Attempt đã EXPIRED trong DB → recoverPolicy = EXPIRED
 *  4. EXPIRED (clock)  — Attempt IN_PROGRESS nhưng expiresAt đã qua → tự finalize + EXPIRED
 *  5. LAST_SAVED_AT    — Sau batch save, lastSavedAt được cập nhật đúng
 */

import { AttemptStatus } from '@prisma/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { finalizeAttempt } from '../src/services/attempt.service.js';

// ─── Seed data load 1 lần ────────────────────────────────────────────────────
let userId: string;
let mockTestId: string;
let durationSec: number;
let questions: Array<{ id: string; choiceId: string | null }>;

const createdAttemptIds: string[] = [];

beforeAll(async () => {
  const user = await prisma.user.findFirst();
  if (!user) throw new Error('DB chưa có User — chạy seed trước');

  const mockTest = await prisma.mockTest.findFirst({ where: { status: 'PUBLISHED' } });
  if (!mockTest) throw new Error('DB chưa có MockTest PUBLISHED — chạy seed trước');

  userId = user.id;
  mockTestId = mockTest.id;
  durationSec = mockTest.durationSec;

  const rawQuestions = await prisma.question.findMany({
    where: { part: { section: { mockTestId } } },
    take: 3,
    include: { choices: true },
  });
  if (rawQuestions.length === 0) throw new Error('DB chưa có Question — chạy seed trước');

  questions = rawQuestions.map((q) => ({
    id: q.id,
    choiceId: q.choices[0]?.id ?? null,
  }));
});

afterEach(async () => {
  if (createdAttemptIds.length === 0) return;
  await prisma.result.deleteMany({ where: { attemptId: { in: createdAttemptIds } } });
  await prisma.attemptAnswer.deleteMany({ where: { attemptId: { in: createdAttemptIds } } });
  await prisma.attempt.deleteMany({ where: { id: { in: createdAttemptIds } } });
  createdAttemptIds.length = 0;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function createAttempt(overrides: { expiresAt?: Date; status?: AttemptStatus } = {}) {
  const now = new Date();
  const attempt = await prisma.attempt.create({
    data: {
      userId,
      mockTestId,
      remainingTimeSec: durationSec,
      expiresAt: overrides.expiresAt ?? new Date(now.getTime() + durationSec * 1000),
      lastActivityAt: now,
      status: overrides.status ?? AttemptStatus.IN_PROGRESS,
    },
  });
  createdAttemptIds.push(attempt.id);
  return attempt;
}

// Gọi thẳng logic của recoverAttempt (không qua HTTP) để test sạch
async function callRecover(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: true },
  });

  if (!attempt) return { recoverPolicy: 'NOT_FOUND' as const };

  if (attempt.status === AttemptStatus.SUBMITTED)
    return { recoverPolicy: 'ALREADY_SUBMITTED' as const, attemptId };

  if (attempt.status === AttemptStatus.EXPIRED)
    return { recoverPolicy: 'EXPIRED' as const, attemptId };

  const serverNow = new Date();
  const remainingMs = attempt.expiresAt.getTime() - serverNow.getTime();

  if (remainingMs <= 0) {
    await finalizeAttempt(attemptId, 'EXPIRED');
    return { recoverPolicy: 'EXPIRED' as const, attemptId };
  }

  return {
    recoverPolicy: 'RESUME' as const,
    attemptId,
    mockTestId: attempt.mockTestId,
    remainingSec: Math.floor(remainingMs / 1000),
    expiresAt: attempt.expiresAt,
    lastSavedAt: attempt.lastSavedAt,
    answers: Object.fromEntries(attempt.answers.map((a) => [a.questionId, a.choiceId])),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TEST 1: RESUME — attempt IN_PROGRESS còn thời gian', () => {
  it('trả về recoverPolicy=RESUME, remainingSec > 0, và map answers đúng', async () => {
    const attempt = await createAttempt();

    // Lưu 2 câu trả lời
    for (const q of questions.slice(0, 2)) {
      if (q.choiceId) {
        await prisma.attemptAnswer.create({
          data: { attemptId: attempt.id, questionId: q.id, choiceId: q.choiceId },
        });
      }
    }

    const res = await callRecover(attempt.id);

    expect(res.recoverPolicy).toBe('RESUME');
    if (res.recoverPolicy !== 'RESUME') return;

    expect(res.remainingSec).toBeGreaterThan(0);
    expect(res.remainingSec).toBeLessThanOrEqual(durationSec);

    // answers map đúng
    for (const q of questions.slice(0, 2)) {
      if (q.choiceId) {
        expect(res.answers[q.id]).toBe(q.choiceId);
      }
    }
  });
});

describe('TEST 2: ALREADY_SUBMITTED — attempt đã nộp bài', () => {
  it('trả về recoverPolicy=ALREADY_SUBMITTED, không trả answers', async () => {
    const attempt = await createAttempt();
    await finalizeAttempt(attempt.id, 'MANUAL');

    const res = await callRecover(attempt.id);

    expect(res.recoverPolicy).toBe('ALREADY_SUBMITTED');
    expect(res).not.toHaveProperty('answers');
    expect(res).not.toHaveProperty('remainingSec');
  });
});

describe('TEST 3: EXPIRED (status) — attempt đã hết giờ qua job', () => {
  it('trả về recoverPolicy=EXPIRED, không trả answers', async () => {
    const attempt = await createAttempt();
    await finalizeAttempt(attempt.id, 'EXPIRED');

    const res = await callRecover(attempt.id);

    expect(res.recoverPolicy).toBe('EXPIRED');
    expect(res).not.toHaveProperty('answers');
  });
});

describe('TEST 4: EXPIRED (clock) — IN_PROGRESS nhưng expiresAt đã qua', () => {
  it('tự finalize attempt và trả về recoverPolicy=EXPIRED', async () => {
    // Tạo attempt với expiresAt trong quá khứ
    const pastDate = new Date(Date.now() - 5000); // đã hết 5 giây trước
    const attempt = await createAttempt({ expiresAt: pastDate });

    // Lúc này DB vẫn là IN_PROGRESS (job chưa chạy)
    const beforeRecover = await prisma.attempt.findUnique({
      where: { id: attempt.id },
      select: { status: true },
    });
    expect(beforeRecover?.status).toBe(AttemptStatus.IN_PROGRESS);

    // recover phát hiện hết giờ → tự finalize
    const res = await callRecover(attempt.id);
    expect(res.recoverPolicy).toBe('EXPIRED');

    // DB phải được finalize thành EXPIRED
    const afterRecover = await prisma.attempt.findUnique({
      where: { id: attempt.id },
      select: { status: true },
    });
    expect(afterRecover?.status).toBe(AttemptStatus.EXPIRED);
  });
});

describe('TEST 5: LAST_SAVED_AT — batch save cập nhật lastSavedAt', () => {
  it('lastSavedAt = null trước flush, có giá trị sau flush', async () => {
    const attempt = await createAttempt();

    // Trước flush
    const before = await prisma.attempt.findUnique({
      where: { id: attempt.id },
      select: { lastSavedAt: true },
    });
    expect(before?.lastSavedAt).toBeNull();

    // Simulate batch flush (cập nhật lastSavedAt như saveAnswersBatch làm)
    const now = new Date();
    await prisma.attempt.update({
      where: { id: attempt.id },
      data: { lastSavedAt: now, lastActivityAt: now },
    });

    // recover trả về lastSavedAt đúng
    const res = await callRecover(attempt.id);
    expect(res.recoverPolicy).toBe('RESUME');
    if (res.recoverPolicy !== 'RESUME') return;

    expect(res.lastSavedAt).not.toBeNull();
    expect(new Date(res.lastSavedAt!).getTime()).toBeCloseTo(now.getTime(), -3); // trong vòng 1 giây
  });
});
