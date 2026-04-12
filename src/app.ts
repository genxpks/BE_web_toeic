import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { env } from './config/env.js';
import { mockTestRouter } from './routes/mockTest.routes.js';
import { attemptRouter } from './routes/attempt.routes.js';
import { uploadRouter } from './routes/upload.routes.js';
import { errorMiddleware } from './middlewares/error.middleware.js';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(`/${env.uploadDir}`, express.static(path.resolve(process.cwd(), env.uploadDir)));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'toeic-mock-be-express' });
});

app.use('/api/mock-tests', mockTestRouter);
app.use('/api/attempts', attemptRouter);
app.use('/api/uploads', uploadRouter);

app.use(errorMiddleware);
