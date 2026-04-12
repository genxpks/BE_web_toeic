import path from 'node:path';
import { Request, Response } from 'express';
import { MediaType } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

const buildFileResponse = async (req: Request, res: Response, type: MediaType) => {
  const file = req.file;

  if (!file) {
    throw new Error('File is required');
  }

  const relativePath = path.join(env.uploadDir, type === MediaType.AUDIO ? 'audio' : 'images', file.filename);
  const publicUrl = `${env.appBaseUrl}/${relativePath.replace(/\\/g, '/')}`;

  const asset = await prisma.mediaAsset.create({
    data: {
      type,
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: relativePath,
      publicUrl,
      sectionId: req.body.sectionId || null,
      partId: req.body.partId || null,
      questionId: req.body.questionId || null,
    },
  });

  res.status(201).json({
    message: 'Upload success',
    data: asset,
  });
};

export const uploadAudio = (req: Request, res: Response) => buildFileResponse(req, res, MediaType.AUDIO);
export const uploadImage = (req: Request, res: Response) => buildFileResponse(req, res, MediaType.IMAGE);
