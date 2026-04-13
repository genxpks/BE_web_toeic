import { Router } from 'express';
import { getAttemptResult, getAttemptSnapshot, saveAnswer, startAttempt, submitAttempt } from '../controllers/attempt.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const attemptRouter = Router();

attemptRouter.post('/start', asyncHandler(startAttempt));
attemptRouter.get('/:attemptId', asyncHandler(getAttemptSnapshot));
attemptRouter.put('/:attemptId/answers', asyncHandler(saveAnswer));
attemptRouter.post('/:attemptId/submit', asyncHandler(submitAttempt));
attemptRouter.get('/:attemptId/result', asyncHandler(getAttemptResult));

