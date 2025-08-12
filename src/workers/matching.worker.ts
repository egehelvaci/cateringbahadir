import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { MatchingService } from '../services/matching.service';
import { logger } from '../utils/logger';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const matchingService = new MatchingService();

export const matchingWorker = new Worker(
  'matching',
  async (job: Job) => {
    const { type, vesselId, cargoId } = job.data;
    
    try {
      let matches = [];

      if (type === 'match-vessel' && vesselId) {
        matches = await matchingService.findTopMatchesForVessel(BigInt(vesselId));
        
        for (const match of matches) {
          await matchingService.createMatch(match.vesselId, match.cargoId);
        }
      } else if (type === 'match-cargo' && cargoId) {
        matches = await matchingService.findTopMatchesForCargo(BigInt(cargoId));
        
        for (const match of matches) {
          await matchingService.createMatch(match.vesselId, match.cargoId);
        }
      }

      logger.info(`Matching completed for ${type}: found ${matches.length} matches`);
      return { status: 'success', matchCount: matches.length };
    } catch (error) {
      logger.error(`Error in matching worker:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  }
);

matchingWorker.on('completed', (job) => {
  logger.info(`Matching worker completed job ${job.id}`);
});

matchingWorker.on('failed', (job, err) => {
  logger.error(`Matching worker failed job ${job?.id}:`, err);
});