import { google } from 'googleapis';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { GoogleOAuthService } from './google-oauth.service';

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: any;
  raw?: string;
}

interface FetchOptions {
  maxResults?: number;
  labelIds?: string[];
  q?: string; // Search query
  includeSpamTrash?: boolean;
}

export class GmailService {
  private googleOAuth: GoogleOAuthService;

  constructor() {
    this.googleOAuth = new GoogleOAuthService();
  }

  async fetchMessages(email: string, options: FetchOptions = {}): Promise<GmailMessage[]> {
    try {
      const accessToken = await this.googleOAuth.getValidAccessToken(email);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // First, get the list of message IDs
      const listParams: any = {
        userId: 'me',
        maxResults: options.maxResults || 50,
        includeSpamTrash: options.includeSpamTrash || false,
      };

      if (options.labelIds && options.labelIds.length > 0) {
        listParams.labelIds = options.labelIds;
      }

      if (options.q) {
        listParams.q = options.q;
      }

      logger.info(`Fetching Gmail messages for ${email} with options:`, options);

      const listResponse = await gmail.users.messages.list(listParams);
      
      if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
        logger.info(`No messages found for ${email}`);
        return [];
      }

      const messages: GmailMessage[] = [];

      // Fetch detailed information for each message
      for (const messageRef of listResponse.data.messages) {
        try {
          const messageResponse = await gmail.users.messages.get({
            userId: 'me',
            id: messageRef.id!,
            format: 'full', // 'full', 'raw', 'metadata', 'minimal'
          });

          const message = messageResponse.data as GmailMessage;
          messages.push(message);

        } catch (messageError) {
          logger.error(`Error fetching message ${messageRef.id}:`, messageError);
          continue; // Skip this message and continue with others
        }
      }

      logger.info(`Successfully fetched ${messages.length} messages for ${email}`);
      return messages;

    } catch (error) {
      logger.error(`Error fetching Gmail messages for ${email}:`, error);
      throw error;
    }
  }

  async fetchUnreadShippingMessages(email: string): Promise<GmailMessage[]> {
    const searchQuery = [
      'is:unread',
      '(shipping OR vessel OR cargo OR charter OR freight OR "bill of lading" OR "shipping instruction")',
      '-(from:noreply OR from:no-reply OR subject:"out of office")',
    ].join(' ');

    return this.fetchMessages(email, {
      maxResults: 20,
      labelIds: ['INBOX'],
      q: searchQuery,
    });
  }

  async fetchMessagesSince(email: string, since: Date): Promise<GmailMessage[]> {
    const sinceQuery = `after:${Math.floor(since.getTime() / 1000)}`;
    
    return this.fetchMessages(email, {
      maxResults: 50,
      q: `${sinceQuery} (shipping OR vessel OR cargo OR charter)`,
      labelIds: ['INBOX'],
    });
  }

  async getMessageById(email: string, messageId: string): Promise<any> {
    try {
      const accessToken = await this.googleOAuth.getValidAccessToken(email);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full', // Get full message content including body
      });

      const message = response.data;
      const headers = this.extractHeaders(message as GmailMessage);
      const body = this.extractMessageBody(message as GmailMessage);

      return {
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds,
        snippet: message.snippet,
        historyId: message.historyId,
        internalDate: message.internalDate,
        headers,
        body,
        raw: message.raw,
        sizeEstimate: message.sizeEstimate,
      };
    } catch (error) {
      logger.error('Error fetching message by ID:', error);
      throw new Error(`Failed to fetch message: ${error}`);
    }
  }

  async saveMessagesToDatabase(messages: GmailMessage[], accountEmail: string): Promise<number> {
    let savedCount = 0;

    for (const message of messages) {
      try {
        // Parse message headers
        const headers = this.extractHeaders(message);
        
        // Get message body (try different formats)
        const messageBody = this.extractMessageBody(message);

        // Check if already exists
        const existing = await prisma.inboundEmail.findFirst({
          where: {
            OR: [
              { messageId: headers.messageId },
              { gmailId: message.id },
            ],
          },
        });

        if (existing) {
          logger.debug(`Message already exists: ${message.id}`);
          continue;
        }

        // Save to database
        await prisma.inboundEmail.create({
          data: {
            messageId: headers.messageId,
            fromAddr: headers.from,
            subject: headers.subject,
            receivedAt: new Date(parseInt(message.internalDate)),
            raw: messageBody,
            gmailId: message.id,
            threadId: message.threadId,
            labelIds: message.labelIds || [],
            historyId: message.historyId,
          },
        });

        savedCount++;
        logger.debug(`Saved message: ${message.id} from ${headers.from}`);

      } catch (error) {
        logger.error(`Error saving message ${message.id}:`, error);
        continue;
      }
    }

    logger.info(`Saved ${savedCount} new messages for ${accountEmail}`);
    return savedCount;
  }

  async pullAndSaveNewMessages(email: string): Promise<{ newMessages: number; totalFetched: number }> {
    try {
      // Fetch recent unread shipping-related messages
      const messages = await this.fetchUnreadShippingMessages(email);
      
      // Save new messages to database
      const newMessages = await this.saveMessagesToDatabase(messages, email);

      return {
        newMessages,
        totalFetched: messages.length,
      };
    } catch (error) {
      logger.error(`Error in pullAndSaveNewMessages for ${email}:`, error);
      throw error;
    }
  }

  async markAsRead(email: string, messageId: string): Promise<void> {
    try {
      const accessToken = await this.googleOAuth.getValidAccessToken(email);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });

      logger.debug(`Marked message as read: ${messageId}`);
    } catch (error) {
      logger.error(`Error marking message as read: ${messageId}`, error);
      throw error;
    }
  }

  async addLabel(email: string, messageId: string, labelName: string): Promise<void> {
    try {
      const accessToken = await this.googleOAuth.getValidAccessToken(email);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // First, try to find the label ID
      const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
      const label = labelsResponse.data.labels?.find(l => l.name === labelName);
      
      if (!label) {
        logger.warn(`Label not found: ${labelName}`);
        return;
      }

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [label.id!],
        },
      });

      logger.debug(`Added label '${labelName}' to message: ${messageId}`);
    } catch (error) {
      logger.error(`Error adding label to message: ${messageId}`, error);
      throw error;
    }
  }

  private extractHeaders(message: GmailMessage): { messageId?: string; from?: string; subject?: string } {
    const headers = message.payload?.headers || [];
    
    const getHeader = (name: string) => {
      const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
      return header?.value;
    };

    return {
      messageId: getHeader('Message-ID'),
      from: getHeader('From'),
      subject: getHeader('Subject'),
    };
  }

  private extractMessageBody(message: GmailMessage): string {
    try {
      // Try to get raw content first
      if (message.raw) {
        return Buffer.from(message.raw, 'base64').toString('utf8');
      }

      // Otherwise, extract from payload
      return this.extractTextFromPayload(message.payload) || message.snippet || '';
    } catch (error) {
      logger.error('Error extracting message body:', error);
      return message.snippet || '';
    }
  }

  private extractTextFromPayload(payload: any): string {
    if (!payload) return '';

    // Single part message
    if (payload.body?.data) {
      try {
        return Buffer.from(payload.body.data, 'base64').toString('utf8');
      } catch {
        return '';
      }
    }

    // Multi-part message
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          try {
            return Buffer.from(part.body.data, 'base64').toString('utf8');
          } catch {
            continue;
          }
        }
        
        // Recursive check for nested parts
        const nested = this.extractTextFromPayload(part);
        if (nested) return nested;
      }
    }

    return '';
  }
}