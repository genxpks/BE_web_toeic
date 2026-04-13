import { Router } from 'express';
import {
  getAttemptSnapshot,
  getInProgressAttempt,
  saveAnswer,
  startAttempt,
  submitAttempt,
  getReviewDetails,
} from '../controllers/attempt.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const attemptRouter = Router();

attemptRouter.get('/in-progress', asyncHandler(getInProgressAttempt));
attemptRouter.post('/start', asyncHandler(startAttempt));
attemptRouter.get('/:attemptId', asyncHandler(getAttemptSnapshot));
attemptRouter.put('/:attemptId/answers', asyncHandler(saveAnswer));
attemptRouter.post('/:attemptId/submit', asyncHandler(submitAttempt));
attemptRouter.get('/:attemptId/review', asyncHandler(getReviewDetails));
