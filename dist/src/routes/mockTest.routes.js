import { Router } from 'express';
import { getMockTestDetail, listMockTests } from '../controllers/mockTest.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
export const mockTestRouter = Router();
mockTestRouter.get('/', asyncHandler(listMockTests));
mockTestRouter.get('/:id', asyncHandler(getMockTestDetail));
