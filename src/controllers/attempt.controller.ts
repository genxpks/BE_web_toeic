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

  const result = await attemptService.submitAttempt(attemptId);

  res.json({ data: result });
}
