import { AttemptStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { calculateRawScore, toScaledScore } from './scoring.service.js';

export type SubmitTrigger = 'MANUAL' | 'EXPIRED';

export async function finalizeAttempt(attemptId: string, trigger: SubmitTrigger) {
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
  if (attempt.status !== AttemptStatus.IN_PROGRESS) return null; // idempotent-safe

  const answersByQuestionId = new Map(
    attempt.answers.map((a) => [a.questionId, a.choiceId]),
  );

  const scoring = calculateRawScore(attempt.mockTest.sections, answersByQuestionId);
  const { overall } = scoring;
  const { listeningScaled, readingScaled, totalScore } = toScaledScore(
    overall.listeningRaw,
    overall.readingRaw,
  );

  const newStatus =
    trigger === 'EXPIRED' ? AttemptStatus.EXPIRED : AttemptStatus.SUBMITTED;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Atomic CAS: chỉ update nếu status vẫn còn IN_PROGRESS
    // Ngăn race condition khi nhiều tab submit đồng thời
    const updated = await tx.attempt.updateMany({
      where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
      data: { status: newStatus, submittedAt: now, lastActivityAt: now },
    });

    if (updated.count === 0) return null; // request khác đã finalize trước

    return tx.result.create({
      data: {
        userId: attempt.userId,
        attemptId,
        listeningRaw: overall.listeningRaw,
        readingRaw: overall.readingRaw,
        listeningScaled,
        readingScaled,
        totalScore,
        correctCount: overall.correctCount,
        wrongCount: overall.wrongCount,
        blankCount: overall.blankCount,
        listeningBlank: overall.listeningBlank,
        readingBlank: overall.readingBlank,
        breakdownJson: JSON.stringify({ sections: scoring.sections, parts: scoring.parts }),
      },
    });
  });

  return result;
}
