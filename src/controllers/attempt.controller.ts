import { AttemptStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { finalizeAttempt } from '../services/attempt.service.js';

const startSchema = z.object({
  userId: z.string().min(1),
  mockTestId: z.string().min(1),
});

const saveAnswerSchema = z.object({
  questionId: z.string().min(1),
  choiceId: z.string().min(1).nullable().optional(),
});

const batchSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        choiceId: z.string().min(1).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function startAttempt(req: Request, res: Response) {
  const body = startSchema.parse(req.body);

  const mockTest = await prisma.mockTest.findUnique({ where: { id: body.mockTestId } });
  if (!mockTest) throw new Error('Mock test not found');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + mockTest.durationSec * 1000);

  const attempt = await prisma.attempt.create({
    data: {
      userId: body.userId,
      mockTestId: body.mockTestId,
      remainingTimeSec: mockTest.durationSec,
      expiresAt,
      lastActivityAt: now,
    },
  });

  res.status(201).json({ data: attempt });
}

export async function saveAnswer(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;
  const body = saveAnswerSchema.parse(req.body);

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error('Attempt not found');
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw new Error('Attempt is not active');

  const answer = await prisma.attemptAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId: body.questionId } },
    create: { attemptId, questionId: body.questionId, choiceId: body.choiceId ?? null },
    update: { choiceId: body.choiceId ?? null, answeredAt: new Date() },
  });

  await prisma.attempt.update({
    where: { id: attemptId },
    data: { lastActivityAt: new Date() },
  });

  res.json({ data: answer });
}

export async function saveAnswersBatch(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;
  const { answers } = batchSchema.parse(req.body);

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error('Attempt not found');
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw new Error('Attempt is not active');

  await prisma.$transaction([
    ...answers.map((a) =>
      prisma.attemptAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        create: { attemptId, questionId: a.questionId, choiceId: a.choiceId ?? null },
        update: { choiceId: a.choiceId ?? null, answeredAt: new Date() },
      }),
    ),
    prisma.attempt.update({
      where: { id: attemptId },
      data: { lastActivityAt: new Date() },
    }),
  ]);

  res.json({ data: { savedCount: answers.length } });
}

export async function getAttemptSnapshot(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: true, mockTest: true },
  });

  if (!attempt) throw new Error('Attempt not found');

  res.json({ data: attempt });
}

export async function syncTimer(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { expiresAt: true, status: true },
  });

  if (!attempt) throw new Error('Attempt not found');

  const serverNow = new Date();

  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    res.json({ data: { remainingSec: 0, isExpired: true, serverNow } });
    return;
  }

  const remainingMs = attempt.expiresAt.getTime() - serverNow.getTime();
  const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));

  if (remainingSec === 0) {
    await finalizeAttempt(attemptId, 'EXPIRED');
    res.json({ data: { remainingSec: 0, isExpired: true, serverNow } });
    return;
  }

  res.json({ data: { remainingSec, isExpired: false, serverNow } });
}

export async function submitAttempt(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;

  const result = await finalizeAttempt(attemptId, 'MANUAL');
  if (!result) throw new Error('Attempt already finished');

  const breakdown = result.breakdownJson ? JSON.parse(result.breakdownJson) : null;
  res.status(201).json({ data: { ...result, breakdown } });
}

export async function getAttemptResult(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;

  const result = await prisma.result.findUnique({ where: { attemptId } });
  if (!result) throw new Error('Result not found – attempt may not be submitted yet');

  const breakdown = result.breakdownJson ? JSON.parse(result.breakdownJson) : null;
  res.json({ data: { ...result, breakdown } });
}
