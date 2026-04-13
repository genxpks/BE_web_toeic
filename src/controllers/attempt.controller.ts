import { AttemptStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import * as attemptService from '../services/attempt.service.js';

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

  const attempt = await attemptService.startAttempt({
    userId: body.userId,
    mockTestId: body.mockTestId,
  });

  res.status(201).json({ data: attempt });
}

export async function saveAnswer(req: Request, res: Response) {
  const attemptId = req.params.attemptId as string;
  const body = saveAnswerSchema.parse(req.body);

  const answer = await attemptService.saveAnswer({
    attemptId,
    questionId: body.questionId,
    choiceId: body.choiceId ?? null,
  });

  res.json({ data: answer });
}

export async function getAttemptSnapshot(req: Request, res: Response) {
  const attemptId = req.params.attemptId as string;

  const snapshot = await attemptService.getAttemptSnapshot(attemptId);

  res.json({ data: snapshot });
}

export async function getActiveAttempt(req: Request, res: Response) {
  const userId = req.query.userId as string;
  const mockTestId = req.query.mockTestId as string;

  if (!userId || !mockTestId) {
    throw new Error('userId and mockTestId are required');
  }

  const attempt = await attemptService.getInProgressAttempt({ userId, mockTestId });

  if (!attempt) {
    res.status(404).json({ data: null, message: 'No active attempt found' });
    return;
  }

  res.json({ data: attempt });
}

export async function submitAttempt(req: Request, res: Response) {
  const attemptId = req.params.attemptId as string;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      mockTest: {
        include: {
          sections: {
            include: {
              parts: {
                include: {
                  questions: {
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

  const questions = attempt.mockTest.sections.flatMap((section) =>
    section.parts.flatMap((part) => part.questions.map((question) => ({ ...question, sectionType: section.type }))),
  );

  const answersByQuestionId = new Map(attempt.answers.map((item) => [item.questionId, item.choiceId]));
  let listeningRaw = 0;
  let readingRaw = 0;
  let correctCount = 0;
  let blankCount = 0;

  for (const question of questions) {
    const selected = answersByQuestionId.get(question.id);
    if (!selected) {
      blankCount += 1;
      continue;
    }

    const correctChoice = question.choices.find((choice) => choice.isCorrect);
    if (correctChoice?.id === selected) {
      correctCount += 1;
      if (question.sectionType === 'LISTENING') listeningRaw += 1;
      else readingRaw += 1;
    }
  }

  const wrongCount = questions.length - correctCount - blankCount;
  const listeningScaled = Math.min(495, listeningRaw * 5);
  const readingScaled = Math.min(495, readingRaw * 5);
  const totalScore = listeningScaled + readingScaled;

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
        listeningRaw,
        readingRaw,
        listeningScaled,
        readingScaled,
        totalScore,
        correctCount,
        wrongCount,
        blankCount,
      },
    });
  });

  res.json({ data: result });
}
