import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../config/database';
import { AIService } from '../services/ai.service';
import { logger } from '../utils/logger';
import { matchingQueue } from '../config/queue';
import { MailboxType } from '@prisma/client';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const aiService = new AIService();

export const emailWorker = new Worker(
  'email-processing',
  async (job: Job) => {
    const { emailId } = job.data;
    
    try {
      const email = await prisma.inboundEmail.findUnique({
        where: { id: BigInt(emailId) },
      });

      if (!email || email.processed) {
        return { status: 'skipped', reason: 'Email not found or already processed' };
      }

      let parsedData = null;
      let entityId = null;

      if (email.mailboxType === MailboxType.VESSEL) {
        parsedData = await aiService.parseEmailToVessel(email.raw || '');
        
        if (parsedData) {
          const vessel = await prisma.vessel.create({
            data: {
              name: parsedData.name,
              imo: parsedData.imo,
              dwt: parsedData.dwt,
              capacityJson: parsedData.capacity,
              currentArea: parsedData.currentArea,
              availableFrom: parsedData.availableFrom,
              gear: parsedData.gear,
            },
          });
          entityId = vessel.id.toString();
          
          await matchingQueue.add('match-vessel', { vesselId: vessel.id.toString() });
        }
      } else if (email.mailboxType === MailboxType.CARGO) {
        parsedData = await aiService.parseEmailToCargo(email.raw || '');
        
        if (parsedData) {
          let loadPortId = null;
          let dischargePortId = null;

          if (parsedData.loadPort) {
            const loadPort = await prisma.port.findFirst({
              where: { 
                OR: [
                  { name: { contains: parsedData.loadPort, mode: 'insensitive' } },
                  { unlocode: parsedData.loadPort },
                ],
              },
            });
            loadPortId = loadPort?.id;
          }

          if (parsedData.dischargePort) {
            const dischargePort = await prisma.port.findFirst({
              where: {
                OR: [
                  { name: { contains: parsedData.dischargePort, mode: 'insensitive' } },
                  { unlocode: parsedData.dischargePort },
                ],
              },
            });
            dischargePortId = dischargePort?.id;
          }

          const cargo = await prisma.cargo.create({
            data: {
              commodity: parsedData.commodity,
              qtyValue: parsedData.quantity?.value,
              qtyUnit: parsedData.quantity?.unit,
              loadPortId,
              dischargePortId,
              laycanStart: parsedData.laycan?.start,
              laycanEnd: parsedData.laycan?.end,
              constraints: parsedData.constraints,
            },
          });
          entityId = cargo.id.toString();
          
          await matchingQueue.add('match-cargo', { cargoId: cargo.id.toString() });
        }
      }

      await prisma.inboundEmail.update({
        where: { id: email.id },
        data: {
          processed: true,
          parsed: parsedData as any,
        },
      });

      logger.info(`Email ${emailId} processed successfully`);
      return { status: 'success', entityId };
    } catch (error) {
      logger.error(`Error processing email ${emailId}:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  }
);

emailWorker.on('completed', (job) => {
  logger.info(`Email worker completed job ${job.id}`);
});

emailWorker.on('failed', (job, err) => {
  logger.error(`Email worker failed job ${job?.id}:`, err);
});