import { app } from './app.js';
import { env } from './config/env.js';
import { startExpiredAttemptJob, stopExpiredAttemptJob } from './jobs/expiredAttempt.job.js';

const jobTimer = startExpiredAttemptJob();

const server = app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`);
});

function gracefulShutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  stopExpiredAttemptJob(jobTimer);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
