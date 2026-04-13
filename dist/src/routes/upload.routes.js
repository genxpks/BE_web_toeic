import { Router } from 'express';
import { uploadAudio, uploadImage } from '../controllers/upload.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audioUpload, imageUpload } from '../services/upload.service.js';
export const uploadRouter = Router();
uploadRouter.post('/audio', audioUpload.single('file'), asyncHandler(uploadAudio));
uploadRouter.post('/images', imageUpload.single('file'), asyncHandler(uploadImage));
