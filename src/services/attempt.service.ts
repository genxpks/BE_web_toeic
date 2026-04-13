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