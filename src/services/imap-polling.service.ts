import { ImapGmailService } from './imap-gmail.service';
import { logger } from '../utils/logger';

export class ImapPollingService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private imapService: ImapGmailService | null = null;

  constructor() {
    if (process.env.GMAIL_IMAP_EMAIL && process.env.GMAIL_IMAP_APP_PASSWORD) {
      this.imapService = new ImapGmailService(
        process.env.GMAIL_IMAP_EMAIL,
        process.env.GMAIL_IMAP_APP_PASSWORD
      );
    }
  }

  startPolling(intervalMs?: number): void {
    if (this.isRunning) {
      logger.warn('IMAP polling is already running');
      return;
    }

    if (!this.imapService) {
      logger.error('IMAP polling cannot start - missing email credentials');
      return;
    }

    const interval = intervalMs || parseInt(process.env.GMAIL_POLLING_INTERVAL || '300000'); // 5 minutes default
    
    logger.info(`Starting IMAP polling with ${interval}ms interval`);
    
    this.isRunning = true;
    
    // Run immediately once
    this.pollEmails();
    
    // Set up periodic polling
    this.pollingInterval = setInterval(() => {
      this.pollEmails();
    }, interval);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.isRunning = false;
    logger.info('IMAP polling stopped');
  }

  private async pollEmails(): Promise<void> {
    if (!this.imapService) return;

    try {
      logger.info('Polling Gmail via IMAP for new messages...');
      
      await this.imapService.connect();
      
      // Fetch latest 20 messages and save to database
      const messages = await this.imapService.getMessages('INBOX', 20, false, true);
      
      await this.imapService.disconnect();
      
      logger.info(`IMAP polling completed. Processed ${messages.length} messages`);
      
    } catch (error) {
      logger.error('IMAP polling error:', error);
    }
  }

  isPolling(): boolean {
    return this.isRunning;
  }
}