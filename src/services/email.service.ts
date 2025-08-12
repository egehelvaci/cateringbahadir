import { ImapFlow } from 'imapflow';
import { google } from 'googleapis';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { MailboxType } from '@prisma/client';
import crypto from 'crypto';

export class EmailService {
  private imapClient: ImapFlow | null = null;
  private gmailClient: any = null;

  constructor() {
    this.initializeClients();
  }

  private async initializeClients() {
    if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_REFRESH_TOKEN) {
      this.initializeGmail();
    } else if (process.env.IMAP_HOST) {
      await this.initializeImap();
    }
  }

  private async initializeImap() {
    try {
      this.imapClient = new ImapFlow({
        host: process.env.IMAP_HOST!,
        port: parseInt(process.env.IMAP_PORT || '993'),
        secure: process.env.IMAP_SECURE === 'true',
        auth: {
          user: process.env.IMAP_USER!,
          pass: process.env.IMAP_PASSWORD!,
        },
        logger: false,
      });

      await this.imapClient.connect();
      logger.info('IMAP client connected successfully');
    } catch (error) {
      logger.error('Failed to connect to IMAP server:', error);
    }
  }

  private initializeGmail() {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      });

      this.gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
      logger.info('Gmail API client initialized');
    } catch (error) {
      logger.error('Failed to initialize Gmail client:', error);
    }
  }

  async fetchEmails(mailboxType: MailboxType, since?: Date) {
    const emails = [];
    
    try {
      if (this.gmailClient) {
        emails.push(...await this.fetchGmailEmails(mailboxType, since));
      } else if (this.imapClient) {
        emails.push(...await this.fetchImapEmails(mailboxType, since));
      }

      for (const email of emails) {
        await this.saveEmail(email, mailboxType);
      }

      return emails;
    } catch (error) {
      logger.error('Error fetching emails:', error);
      throw error;
    }
  }

  private async fetchImapEmails(mailboxType: MailboxType, since?: Date) {
    const emails = [];
    
    try {
      await this.imapClient!.mailboxOpen('INBOX');
      
      const searchCriteria = {
        seen: false,
        ...(since && { since: since.toISOString() }),
      };

      const messages = await this.imapClient!.search(searchCriteria);
      
      for (const uid of messages) {
        const message = await this.imapClient!.fetchOne(uid, {
          envelope: true,
          bodyParts: true,
          bodyStructure: true,
          source: true,
        });

        emails.push({
          messageId: message.envelope.messageId,
          from: message.envelope.from?.[0]?.address,
          subject: message.envelope.subject,
          receivedAt: message.envelope.date,
          raw: message.source.toString(),
        });
      }

      return emails;
    } catch (error) {
      logger.error('Error fetching IMAP emails:', error);
      return [];
    }
  }

  private async fetchGmailEmails(mailboxType: MailboxType, since?: Date) {
    const emails = [];
    
    try {
      const query = [
        'is:unread',
        mailboxType === MailboxType.VESSEL ? 'subject:vessel' : 'subject:cargo',
        since ? `after:${Math.floor(since.getTime() / 1000)}` : '',
      ].filter(Boolean).join(' ');

      const response = await this.gmailClient.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50,
      });

      if (!response.data.messages) return [];

      for (const message of response.data.messages) {
        const fullMessage = await this.gmailClient.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        });

        const headers = fullMessage.data.payload.headers;
        const getHeader = (name: string) => 
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;

        emails.push({
          messageId: getHeader('message-id'),
          from: getHeader('from'),
          subject: getHeader('subject'),
          receivedAt: new Date(parseInt(fullMessage.data.internalDate)),
          raw: Buffer.from(fullMessage.data.raw || '', 'base64').toString(),
        });
      }

      return emails;
    } catch (error) {
      logger.error('Error fetching Gmail emails:', error);
      return [];
    }
  }

  private async saveEmail(emailData: any, mailboxType: MailboxType) {
    try {
      const dedupHash = crypto
        .createHash('sha256')
        .update(`${emailData.messageId}${emailData.from}${emailData.subject}`)
        .digest('hex');

      await prisma.inboundEmail.upsert({
        where: { dedupHash },
        update: {},
        create: {
          mailboxType,
          provider: this.gmailClient ? 'gmail' : 'imap',
          messageId: emailData.messageId,
          fromAddr: emailData.from,
          subject: emailData.subject,
          receivedAt: emailData.receivedAt,
          raw: emailData.raw,
          dedupHash,
        },
      });

      logger.info(`Email saved: ${emailData.subject}`);
    } catch (error) {
      logger.error('Error saving email:', error);
    }
  }

  async disconnect() {
    if (this.imapClient) {
      await this.imapClient.logout();
    }
  }
}