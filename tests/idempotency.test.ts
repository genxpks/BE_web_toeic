/**
 * ════════════════════════════════════════════════════════════════
 *  TEST: Chống Submit Trùng & Khóa Attempt Sau Submit
 *  Chạy: npx vitest run
 * ════════════════════════════════════════════════════════════════
 *
 *  Ba tình huống được kiểm tra:
 *  1. IDEMPOTENCY     — Submit 2 lần: lần 2 phải trả về null (không tạo result mới)
 *  2. LOCK ANSWER     — Sau submit, saveAnswer phải bị từ chối
 *  3. RACE CONDITION  — 5 tab submit đồng thời: chỉ đúng 1 lần finalize thành công
 */

import { AttemptStatus } from '@prisma/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { finalizeAttempt } from '../src/services/attempt.service.js';

// ─── Seed data được load 1 lần ───────────────────────────────────────────────
let userId: string;
let mockTestId: string;
let durationSec: number;
let questions: Array<{
  id: string;
  correctChoiceId: string | null;
  wrongChoiceId: string | null;
}>;

const createdAttemptIds: string[] = [];

beforeAll(async () => {
  const user = await prisma.user.findFirst();
  if (!user) throw new Error('DB chưa có User — chạy seed trước');

  const mockTest = await prisma.mockTest.findFirst({
    where: { status: 'PUBLISHED' },
  });
  if (!mockTest) throw new Error('DB chưa có MockTest PUBLISHED — chạy seed trước');

  userId = user.id;
  mockTestId = mockTest.id;
  durationSec = mockTest.durationSec;

  const rawQuestions = await prisma.question.findMany({
    where: { part: { section: { mockTestId } } },
    take: 5,
    include: { choices: true },
  });

  if (rawQuestions.length === 0) throw new Error('DB chưa có Question — chạy seed trước');

  questions = rawQuestions.map((q) => ({
    id: q.id,
    correctChoiceId: q.choices.find((c) => c.isCorrect)?.id ?? null,
    wrongChoiceId: q.choices.find((c) => !c.isCorrect)?.id ?? null,
  }));
});

afterEach(async () => {
  if (createdAttemptIds.length === 0) return;
  await prisma.result.deleteMany({ where: { attemptId: { in: createdAttemptIds } } });
  await prisma.attemptAnswer.deleteMany({ where: { attemptId: { in: createdAttemptIds } } });
  await prisma.attempt.deleteMany({ where: { id: { in: createdAttemptIds } } });
  createdAttemptIds.length = 0;
});

// ─── Helper ──────────────────────────────────────────────────────────────────
async function createAttempt(): Promise<string> {
  const now = new Date();
  const attempt = await prisma.attempt.create({
    data: {
      userId,
      mockTestId,
      remainingTimeSec: durationSec,
      expiresAt: new Date(now.getTime() + durationSec * 1000),
      lastActivityAt: now,
    },
  });
  createdAttemptIds.push(attempt.id);
  return attempt.id;
}

async function saveAnswer(attemptId: string, questionId: string, choiceId: string | null) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.findUnique({
      where: { id: attemptId },
      select: { status: true },
    });
    if (!attempt) throw new Error('Attempt not found');
    if (attempt.status !== AttemptStatus.IN_PROGRESS) throw new Error('Attempt is not active');

    const saved = await tx.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: { attemptId, questionId, choiceId },
      update: { choiceId, answeredAt: new Date() },
    });

    await tx.attempt.update({
      where: { id: attemptId },
      data: { lastActivityAt: new Date() },
    });

    return saved;
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TEST 1: IDEMPOTENCY — Submit 2 lần cùng 1 attempt', () => {
  it('lần 1 tạo result mới, lần 2 trả về null (idempotent)', async () => {
    const attemptId = await createAttempt();
    const q0 = questions[0]!;

    if (q0.correctChoiceId) {
      await saveAnswer(attemptId, q0.id, q0.correctChoiceId);
    }

    // Submit lần 1 — phải tạo result mới
    const result1 = await finalizeAttempt(attemptId, 'MANUAL');
    expect(result1).not.toBeNull();
    expect(result1?.attemptId).toBe(attemptId);

    // Submit lần 2 — phải idempotent (trả null vì đã finalize)
    const result2 = await finalizeAttempt(attemptId, 'MANUAL');
    expect(result2).toBeNull();

    // DB chỉ có đúng 1 Result
    const count = await prisma.result.count({ where: { attemptId } });
    expect(count).toBe(1);

    // Attempt status phải là SUBMITTED
    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { status: true },
    });
    expect(attempt?.status).toBe(AttemptStatus.SUBMITTED);
  });
});

describe('TEST 2: LOCK ANSWER — Ghi đáp án sau khi submit bị khóa', () => {
  it('saveAnswer trước submit OK, sau submit bị reject', async () => {
    const attemptId = await createAttempt();
    const q0 = questions[0]!;

    // Trước submit → thành công
    if (q0.correctChoiceId) {
      await expect(saveAnswer(attemptId, q0.id, q0.correctChoiceId)).resolves.toBeTruthy();
    }

    // Submit
    await finalizeAttempt(attemptId, 'MANUAL');

    // Sau submit → phải throw
    await expect(
      saveAnswer(attemptId, q0.id, q0.wrongChoiceId),
    ).rejects.toThrow(/not active/i);

    // Đáp án trong DB KHÔNG bị overwrite
    if (q0.correctChoiceId) {
      const saved = await prisma.attemptAnswer.findUnique({
        where: { attemptId_questionId: { attemptId, questionId: q0.id } },
      });
      expect(saved?.choiceId).toBe(q0.correctChoiceId);
    }
  });
});

describe('TEST 3: RACE CONDITION — 5 tab submit đồng thời', () => {
  it('chỉ đúng 1 tab finalize thành công, 4 tab còn lại trả null', async () => {
    const attemptId = await createAttempt();

    // Gửi vài câu trả lời trước
    for (const q of questions.slice(0, 3)) {
      if (q.correctChoiceId) {
        await saveAnswer(attemptId, q.id, q.correctChoiceId);
      }
    }

    const CONCURRENCY = 5;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        new Promise<Awaited<ReturnType<typeof finalizeAttempt>>>((resolve, reject) => {
          const delay = Math.floor(Math.random() * 10);
          setTimeout(async () => {
            try {
              resolve(await finalizeAttempt(attemptId, 'MANUAL'));
            } catch (e) {
              reject(e);
            }
          }, delay);
        }),
      ),
    );

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value !== null,
    );
    const idempotent = results.filter(
      (r) => r.status === 'fulfilled' && r.value === null,
    );
    const failed = results.filter((r) => r.status === 'rejected');

    // Đúng 1 tab thắng
    expect(succeeded.length).toBe(1);
    // 4 tab còn lại idempotent-safe (không throw)
    expect(idempotent.length).toBe(CONCURRENCY - 1);
    expect(failed.length).toBe(0);

    // DB chỉ có đúng 1 Result
    const count = await prisma.result.count({ where: { attemptId } });
    expect(count).toBe(1);

    // Attempt status = SUBMITTED
    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { status: true },
    });
    expect(attempt?.status).toBe(AttemptStatus.SUBMITTED);
  });
});
