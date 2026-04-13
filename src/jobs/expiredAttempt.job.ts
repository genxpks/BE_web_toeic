import { AttemptStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { finalizeAttempt } from '../services/attempt.service.js';

async function processExpiredAttempts() {
  const expired = await prisma.attempt.findMany({
    where: {
      status: AttemptStatus.IN_PROGRESS,
      expiresAt: { lte: new Date() },
    },
    select: { id: true },
  });

  for (const { id } of expired) {
    try {
      await finalizeAttempt(id, 'EXPIRED');
    } catch (err) {
      console.error(`[expiredAttemptJob] Failed to finalize attempt ${id}:`, err);
    }
  }
}

export function startExpiredAttemptJob(intervalMs = 60_000): NodeJS.Timeout {
  console.log(`[expiredAttemptJob] Started, interval=${intervalMs}ms`);
  let running = false;
  return setInterval(() => {
    if (running) return;
    running = true;
    processExpiredAttempts()
      .catch((err) => console.error('[expiredAttemptJob] Error:', err))
      .finally(() => { running = false; });
  }, intervalMs);
}

export function stopExpiredAttemptJob(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  console.log('[expiredAttemptJob] Stopped');
}
