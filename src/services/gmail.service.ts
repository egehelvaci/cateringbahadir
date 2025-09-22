import { logger } from '../utils/logger';

export class GmailService {
  constructor() {
    logger.info('GmailService initialized - AI processing disabled');
  }

  async fetchMessages(email: string, _options: any = {}): Promise<any[]> {
    try {
      logger.info(`Fetching messages for ${email} - AI processing disabled`);
      
      // Return empty array since AI processing is disabled
      return [];

    } catch (error) {
      logger.error('Error fetching Gmail messages:', error);
      throw error;
    }
  }

  async pullAndSaveNewMessages(email: string): Promise<{
    newMessages: number;
    totalFetched: number;
  }> {
    try {
      logger.info(`Pulling messages for ${email} - AI processing disabled`);
      
      return {
        newMessages: 0,
        totalFetched: 0
      };

    } catch (error) {
      logger.error('Error pulling and saving messages:', error);
      throw error;
    }
  }
}

export default GmailService;