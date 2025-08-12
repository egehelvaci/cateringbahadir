import { GmailService } from './gmail.service';
import { GoogleOAuthService } from './google-oauth.service';
import { logger } from '../utils/logger';

export class GmailPollingService {
  private gmailService: GmailService;
  private googleOAuth: GoogleOAuthService;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.gmailService = new GmailService();
    this.googleOAuth = new GoogleOAuthService();
  }

  startPolling(intervalMs?: number): void {
    if (this.isRunning) {
      logger.warn('Gmail polling is already running');
      return;
    }

    const interval = intervalMs || parseInt(process.env.GMAIL_POLLING_INTERVAL || '300000'); // 5 minutes default
    
    logger.info(`Starting Gmail polling with ${interval}ms interval`);
    
    this.isRunning = true;
    
    // Run immediately once
    this.pollAllAccounts();
    
    // Then set interval
    this.pollingInterval = setInterval(() => {
      this.pollAllAccounts();
    }, interval);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.isRunning = false;
    logger.info('Gmail polling stopped');
  }

  async pollAllAccounts(): Promise<void> {
    try {
      const accounts = await this.googleOAuth.listAuthorizedAccounts();
      
      if (accounts.length === 0) {
        logger.debug('No Gmail accounts to poll');
        return;
      }

      logger.info(`Polling ${accounts.length} Gmail accounts for new messages`);

      const results = [];
      
      for (const account of accounts) {
        try {
          const result = await this.gmailService.pullAndSaveNewMessages(account.email);
          
          if (result.newMessages > 0) {
            logger.info(`Found ${result.newMessages} new messages for ${account.email}`);
          }
          
          results.push({
            email: account.email,
            success: true,
            newMessages: result.newMessages,
            totalFetched: result.totalFetched,
          });
        } catch (accountError) {
          logger.error(`Polling error for ${account.email}:`, accountError);
          results.push({
            email: account.email,
            success: false,
            error: (accountError as Error).message,
          });
        }
      }

      const totalNewMessages = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.newMessages || 0), 0);

      if (totalNewMessages > 0) {
        logger.info(`Polling completed: ${totalNewMessages} new messages across all accounts`);
      } else {
        logger.debug('Polling completed: No new messages found');
      }

    } catch (error) {
      logger.error('Error in Gmail polling cycle:', error);
    }
  }

  async pollSingleAccount(email: string): Promise<{ newMessages: number; totalFetched: number }> {
    try {
      logger.info(`Polling single account: ${email}`);
      
      const result = await this.gmailService.pullAndSaveNewMessages(email);
      
      logger.info(`Polling result for ${email}: ${result.newMessages} new messages`);
      
      return result;
    } catch (error) {
      logger.error(`Error polling account ${email}:`, error);
      throw error;
    }
  }

  isPollingActive(): boolean {
    return this.isRunning;
  }

  getPollingStatus(): { active: boolean; interval?: number } {
    return {
      active: this.isRunning,
      interval: this.pollingInterval ? 
        parseInt(process.env.GMAIL_POLLING_INTERVAL || '300000') : 
        undefined,
    };
  }
}