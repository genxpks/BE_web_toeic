import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
const ensureDir = (dir) => {
    fs.mkdirSync(dir, { recursive: true });
};
const makeStorage = (folder) => {
    const absoluteDir = path.resolve(process.cwd(), env.uploadDir, folder);
    ensureDir(absoluteDir);
    return multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, absoluteDir),
        filename: (_req, file, cb) => {
            const safeName = file.originalname.replace(/\s+/g, '-').toLowerCase();
            cb(null, `${Date.now()}-${safeName}`);
        },
    });
};
const audioMimeTypes = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
]);
const imageMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);
export const audioUpload = multer({
    storage: makeStorage('audio'),
    limits: { fileSize: env.maxAudioSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!audioMimeTypes.has(file.mimetype)) {
            return cb(new Error('Invalid audio format'));
        }
        cb(null, true);
    },
});
export const imageUpload = multer({
    storage: makeStorage('images'),
    limits: { fileSize: env.maxImageSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!imageMimeTypes.has(file.mimetype)) {
            return cb(new Error('Invalid image format'));
        }
        cb(null, true);
    },
});
