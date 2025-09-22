import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export class EmailProcessingService {
  async processUnprocessedEmails(): Promise<{
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
  }> {
    const totalEmails = await prisma.inboundEmail.count();

    return {
      totalEmails,
      processedEmails: 0,
      unprocessedEmails: totalEmails,
      cargoCount: 0,
      vesselCount: 0
    };
  }
}

export default EmailProcessingService;