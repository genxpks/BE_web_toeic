import dotenv from 'dotenv';

dotenv.config();

const toMb = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const env = {
  port: Number(process.env.PORT || 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:8080',
  uploadDir: process.env.UPLOAD_DIR || 'storage/uploads',
  maxAudioSizeMb: toMb(process.env.MAX_AUDIO_SIZE_MB, 25),
  maxImageSizeMb: toMb(process.env.MAX_IMAGE_SIZE_MB, 8),
};
