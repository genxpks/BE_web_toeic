import { prisma } from '../config/prisma.js';
import { AttemptStatus, TestStatus } from '@prisma/client';

export interface StartAttemptParams {
  userId: string;
  mockTestId: string;
}

export interface AttemptInfo {
  id: string;
  userId: string;
  mockTestId: string;
  status: AttemptStatus;
  startedAt: Date;
  remainingTimeSec: number;
  lastActivityAt: Date;
  createdAt: Date;
}

export async function startAttempt(params: StartAttemptParams): Promise<AttemptInfo> {
  const { userId, mockTestId } = params;

  const mockTest = await prisma.mockTest.findUnique({
    where: { id: mockTestId },
  });

  if (!mockTest) {
    throw new Error('Mock test not found');
  }

  if (mockTest.status !== TestStatus.PUBLISHED) {
    throw new Error('Mock test is not available');
  }

  const existingAttempt = await prisma.attempt.findFirst({
    where: {
      userId,
      mockTestId,
      status: AttemptStatus.IN_PROGRESS,
    },
  });

  if (existingAttempt) {
    return {
      id: existingAttempt.id,
      userId: existingAttempt.userId,
      mockTestId: existingAttempt.mockTestId,
      status: existingAttempt.status,
      startedAt: existingAttempt.startedAt,
      remainingTimeSec: existingAttempt.remainingTimeSec,
      lastActivityAt: existingAttempt.lastActivityAt!,
      createdAt: existingAttempt.createdAt,
    };
  }

  const attempt = await prisma.attempt.create({
    data: {
      userId,
      mockTestId,
      remainingTimeSec: mockTest.durationSec,
      lastActivityAt: new Date(),
    },
  });

  return {
    id: attempt.id,
    userId: attempt.userId,
    mockTestId: attempt.mockTestId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    remainingTimeSec: attempt.remainingTimeSec,
    lastActivityAt: attempt.lastActivityAt!,
    createdAt: attempt.createdAt,
  };
}

export interface SaveAnswerParams {
  attemptId: string;
  questionId: string;
  choiceId: string | null;
}

export interface AttemptAnswerInfo {
  id: string;
  attemptId: string;
  questionId: string;
  choiceId: string | null;
  answeredAt: Date;
}

export async function saveAnswer(params: SaveAnswerParams): Promise<AttemptAnswerInfo> {
  const { attemptId, questionId, choiceId } = params;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
  });

  if (!attempt) {
    throw new Error('Attempt not found');
  }

  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    throw new Error('Attempt is not active');
  }

  const answer = await prisma.attemptAnswer.upsert({
    where: {
      attemptId_questionId: {
        attemptId,
        questionId,
      },
    },
    create: {
      attemptId,
      questionId,
      choiceId: choiceId || null,
    },
    update: {
      choiceId: choiceId || null,
      answeredAt: new Date(),
    },
  });

  await prisma.attempt.update({
    where: { id: attemptId },
    data: { lastActivityAt: new Date() },
  });

  return {
    id: answer.id,
    attemptId: answer.attemptId,
    questionId: answer.questionId,
    choiceId: answer.choiceId,
    answeredAt: answer.answeredAt,
  };
}