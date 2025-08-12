const Imap = require('imap');
const { simpleParser } = require('mailparser');
import { logger } from '../utils/logger';

interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  body: string;
  html?: string;
  attachments?: any[];
}

export class ImapGmailService {
  private imap: any;

  constructor(email: string, appPassword: string) {
    this.imap = new Imap({
      user: email,
      password: appPassword,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false
      }
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap.once('ready', () => {
        logger.info('IMAP connection ready');
        resolve();
      });

      this.imap.once('error', (err: Error) => {
        logger.error('IMAP connection error:', err);
        reject(err);
      });

      this.imap.connect();
    });
  }

  async getMessages(folder: string = 'INBOX', limit: number = 50): Promise<EmailMessage[]> {
    return new Promise((resolve, reject) => {
      this.imap.openBox(folder, true, (err: any, mailbox: any) => {
        if (err) {
          logger.error('Error opening mailbox:', err);
          return reject(err);
        }

        logger.info(`Opened mailbox: ${folder}, total messages: ${mailbox.messages.total}`);

        // Get latest messages
        const searchCriteria = ['ALL'];
        const fetchOptions = {
          bodies: '',
          markSeen: false,
          struct: true
        };

        this.imap.search(searchCriteria, (searchErr: any, uids: any) => {
          if (searchErr) {
            logger.error('Search error:', searchErr);
            return reject(searchErr);
          }

          if (!uids || uids.length === 0) {
            logger.info('No messages found');
            return resolve([]);
          }

          // Get latest messages (limit)
          const latestUids = uids.slice(-limit);
          logger.info(`Fetching ${latestUids.length} messages`);

          const messages: EmailMessage[] = [];
          const fetch = this.imap.fetch(latestUids, fetchOptions);

          fetch.on('message', (msg: any, seqno: any) => {
            let emailData: any = {};

            msg.on('body', (stream: any, _info: any) => {
              let buffer = '';
              stream.on('data', (chunk: any) => {
                buffer += chunk.toString('utf8');
              });

              stream.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);
                  emailData = {
                    id: `${seqno}`,
                    subject: parsed.subject || 'No Subject',
                    from: parsed.from?.text || 'Unknown',
                    to: parsed.to?.text || 'Unknown',
                    date: parsed.date || new Date(),
                    body: parsed.text || '',
                    html: parsed.html || undefined,
                    attachments: parsed.attachments || []
                  };
                } catch (parseErr) {
                  logger.error('Email parsing error:', parseErr);
                  emailData = {
                    id: `${seqno}`,
                    subject: 'Parse Error',
                    from: 'Unknown',
                    to: 'Unknown',
                    date: new Date(),
                    body: 'Error parsing email',
                    html: undefined,
                    attachments: []
                  };
                }
              });
            });

            msg.once('end', () => {
              messages.push(emailData);
            });
          });

          fetch.once('error', (fetchErr: any) => {
            logger.error('Fetch error:', fetchErr);
            reject(fetchErr);
          });

          fetch.once('end', () => {
            logger.info(`Successfully fetched ${messages.length} messages`);
            resolve(messages);
          });
        });
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.imap.end();
      logger.info('IMAP connection closed');
      resolve();
    });
  }

  static async testConnection(email: string, appPassword: string): Promise<boolean> {
    try {
      const service = new ImapGmailService(email, appPassword);
      await service.connect();
      await service.disconnect();
      return true;
    } catch (error) {
      logger.error('IMAP test connection failed:', error);
      return false;
    }
  }
}