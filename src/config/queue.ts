import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const emailQueue = new Queue('email-processing', { connection });
export const matchingQueue = new Queue('matching', { connection });

export const emailQueueEvents = new QueueEvents('email-processing', { connection });
export const matchingQueueEvents = new QueueEvents('matching', { connection });

emailQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info(`Email job ${jobId} completed`);
});

emailQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Email job ${jobId} failed: ${failedReason}`);
});

matchingQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info(`Matching job ${jobId} completed`);
});

matchingQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Matching job ${jobId} failed: ${failedReason}`);
});

export const closeQueues = async () => {
  await emailQueue.close();
  await matchingQueue.close();
  await emailQueueEvents.close();
  await matchingQueueEvents.close();
  await connection.quit();
};