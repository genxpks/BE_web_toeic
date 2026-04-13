import { AttemptStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { calculateRawScore } from '../services/scoring.service.js';

const startSchema = z.object({
  userId: z.string().min(1),
  mockTestId: z.string().min(1),
});

const saveAnswerSchema = z.object({
  questionId: z.string().min(1),
  choiceId: z.string().min(1).nullable().optional(),
});

export async function startAttempt(req: Request, res: Response) {
  const body = startSchema.parse(req.body);

  const mockTest = await prisma.mockTest.findUnique({ where: { id: body.mockTestId } });
  if (!mockTest) throw new Error('Mock test not found');

  const attempt = await prisma.attempt.create({
    data: {
      userId: body.userId,
      mockTestId: body.mockTestId,
      remainingTimeSec: mockTest.durationSec,
      lastActivityAt: new Date(),
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
    where: {
      attemptId_questionId: {
        attemptId,
        questionId: body.questionId,
      },
    },
    create: {
      attemptId,
      questionId: body.questionId,
      choiceId: body.choiceId ?? null,
    },
    update: {
      choiceId: body.choiceId ?? null,
      answeredAt: new Date(),
    },
  });

  await prisma.attempt.update({
    where: { id: attemptId },
    data: { lastActivityAt: new Date() },
  });

  res.json({ data: answer });
}

export async function getAttemptSnapshot(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      mockTest: true,
    },
  });

  if (!attempt) throw new Error('Attempt not found');

  res.json({ data: attempt });
}

export async function submitAttempt(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      mockTest: {
        include: {
          sections: {
            orderBy: { orderNo: 'asc' },
            include: {
              parts: {
                orderBy: { orderNo: 'asc' },
                include: {
                  questions: {
                    orderBy: { orderNo: 'asc' },
                    include: { choices: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!attempt) throw new Error('Attempt not found');
  if (attempt.status !== AttemptStatus.IN_PROGRESS) throw new Error('Attempt already finished');

  // Build answer map: questionId → choiceId | null
  const answersByQuestionId = new Map(
    attempt.answers.map((a) => [a.questionId, a.choiceId]),
  );

  // ── Scoring engine ──────────────────────────────────────────────────────
  const scoring = calculateRawScore(attempt.mockTest.sections, answersByQuestionId);
  const { overall } = scoring;

  const listeningScaled = Math.min(495, overall.listeningRaw * 5);
  const readingScaled   = Math.min(495, overall.readingRaw * 5);
  const totalScore      = listeningScaled + readingScaled;

  // ── Persist ─────────────────────────────────────────────────────────────
  const result = await prisma.$transaction(async (tx) => {
    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    return tx.result.create({
      data: {
        userId: attempt.userId,
        attemptId,
        listeningRaw:    overall.listeningRaw,
        readingRaw:      overall.readingRaw,
        listeningScaled,
        readingScaled,
        totalScore,
        correctCount:    overall.correctCount,
        wrongCount:      overall.wrongCount,
        blankCount:      overall.blankCount,
      },
    });
  });

  // Return persisted result + live breakdown
  res.status(201).json({
    data: {
      ...result,
      breakdown: {
        sections: scoring.sections,
        parts:    scoring.parts,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// GET /attempts/:attemptId/result
// ---------------------------------------------------------------------------
export async function getAttemptResult(req: Request, res: Response) {
  const attemptId = req.params['attemptId'] as string;

  // Load persisted result
  const result = await prisma.result.findUnique({
    where: { attemptId },
  });
  if (!result) throw new Error('Result not found – attempt may not be submitted yet');

  // Re-load attempt with full structure to compute breakdown
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      mockTest: {
        include: {
          sections: {
            orderBy: { orderNo: 'asc' },
            include: {
              parts: {
                orderBy: { orderNo: 'asc' },
                include: {
                  questions: {
                    orderBy: { orderNo: 'asc' },
                    include: { choices: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!attempt) throw new Error('Attempt not found');

  const answersByQuestionId = new Map(
    attempt.answers.map((a) => [a.questionId, a.choiceId]),
  );

  const scoring = calculateRawScore(attempt.mockTest.sections, answersByQuestionId);

  res.json({
    data: {
      ...result,
      breakdown: {
        sections: scoring.sections,
        parts:    scoring.parts,
      },
    },
  });
}
