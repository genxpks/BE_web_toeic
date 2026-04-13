import { Router } from 'express';
import { getActiveAttempt, getAttemptSnapshot, saveAnswer, startAttempt, submitAttempt } from '../controllers/attempt.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const attemptRouter = Router();

attemptRouter.post('/start', asyncHandler(startAttempt));
attemptRouter.get('/active', asyncHandler(getActiveAttempt));
attemptRouter.get('/:attemptId', asyncHandler(getAttemptSnapshot));
attemptRouter.put('/:attemptId/answers', asyncHandler(saveAnswer));
attemptRouter.post('/:attemptId/submit', asyncHandler(submitAttempt));
