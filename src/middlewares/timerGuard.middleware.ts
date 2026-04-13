import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { finalizeAttempt } from '../services/attempt.service.js';

export async function timerGuard(req: Request, res: Response, next: NextFunction) {
  const attemptId = req.params['attemptId'] as string;
  if (!attemptId) return next();

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { expiresAt: true, status: true },
  });

  if (!attempt) return next();

  if (attempt.status !== 'IN_PROGRESS' || attempt.expiresAt <= new Date()) {
    if (attempt.status === 'IN_PROGRESS') {
      await finalizeAttempt(attemptId, 'EXPIRED');
    }
    res.status(410).json({ error: 'Attempt has expired' });
    return;
  }

  next();
}
