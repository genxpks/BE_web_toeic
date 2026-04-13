import { Router } from 'express';
import {
  getAttemptResult,
  getAttemptSnapshot,
  saveAnswer,
  saveAnswersBatch,
  startAttempt,
  submitAttempt,
  syncTimer,
} from '../controllers/attempt.controller.js';
import { timerGuard } from '../middlewares/timerGuard.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const attemptRouter = Router();

attemptRouter.post('/start', asyncHandler(startAttempt));
attemptRouter.get('/:attemptId', asyncHandler(getAttemptSnapshot));
attemptRouter.get('/:attemptId/sync', asyncHandler(syncTimer));
attemptRouter.put('/:attemptId/answers', asyncHandler(timerGuard), asyncHandler(saveAnswer));
attemptRouter.put('/:attemptId/answers/batch', asyncHandler(timerGuard), asyncHandler(saveAnswersBatch));
attemptRouter.post('/:attemptId/submit', asyncHandler(timerGuard), asyncHandler(submitAttempt));
attemptRouter.get('/:attemptId/result', asyncHandler(getAttemptResult));
