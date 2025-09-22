import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export class AutomatedMailProcessorService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    logger.info('AutomatedMailProcessorService initialized - AI processing disabled');
  }

  async startAutomaticProcessing(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Automated processing is already running');
      return;
    }

    logger.info('Automated mail processing is disabled - AI processing removed');
    this.isRunning = true;
  }

  async stopAutomaticProcessing(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Automated processing stopped');
  }

  async processAllUnprocessedEmails(): Promise<{
    processed: number;
    errors: number;
    skipped: number;
  }> {
    logger.info('AI processing disabled - no emails to process');
    
    return {
      processed: 0,
      errors: 0,
      skipped: 0
    };
  }

  async getProcessingStats(): Promise<{
    totalEmails: number;
    processedEmails: number;
    unprocessedEmails: number;
    cargoCount: number;
    vesselCount: number;
    matchCount: number;
  }> {
    const totalEmails = await prisma.inboundEmail.count();

    return {
      totalEmails,
      processedEmails: 0,
      unprocessedEmails: totalEmails,
      cargoCount: 0,
      vesselCount: 0,
      matchCount: 0
    };
  }

  isProcessingRunning(): boolean {
    return this.isRunning;
  }
}

export default AutomatedMailProcessorService;