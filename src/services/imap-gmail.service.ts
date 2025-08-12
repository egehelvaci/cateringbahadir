const Imap = require('imap');
const { simpleParser } = require('mailparser');
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

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

  async getMessages(folder: string = 'INBOX', limit: number = 50, filterCatering: boolean = false, saveToDb: boolean = true): Promise<EmailMessage[]> {
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
          let pendingMessages = 0;

          fetch.on('message', (msg: any, seqno: any) => {
            pendingMessages++;
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
              // Wait a bit for parsing to complete
              setTimeout(() => {
                messages.push(emailData);
                pendingMessages--;
                
                // Check if all messages are processed
                if (pendingMessages === 0) {
                  this.processMessages(messages, filterCatering, saveToDb, resolve);
                }
              }, 100);
            });
          });

          fetch.once('error', (fetchErr: any) => {
            logger.error('Fetch error:', fetchErr);
            reject(fetchErr);
          });

          fetch.once('end', () => {
            // This will be handled by processMessages when all messages are complete
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

  private async processMessages(messages: EmailMessage[], filterCatering: boolean, saveToDb: boolean, resolve: any): Promise<void> {
    let filteredMessages = messages;
    
    if (filterCatering) {
      filteredMessages = messages.filter(msg => this.isCateringRelated(msg));
      logger.info(`Filtered ${messages.length} messages to ${filteredMessages.length} catering/broker related messages`);
    }
    
    // Save to database if requested
    if (saveToDb) {
      await this.saveMessagesToDatabase(filteredMessages);
    }
    
    logger.info(`Successfully fetched ${filteredMessages.length} messages`);
    resolve(filteredMessages);
  }

  private isCateringRelated(message: EmailMessage): boolean {
    // Null checks
    if (!message || !message.subject || !message.from) {
      return false;
    }

    const businessKeywords = [
      // Highly specific catering terms
      'catering', 'cater', 'banquet', 'buffet', 'wedding catering', 'event catering',
      'corporate catering', 'outdoor catering', 'food service', 'kitchen rental',
      'chef service', 'menu planning', 'event planning',
      
      // Highly specific shipping/broker terms
      'shipbroker', 'ship broker', 'vessel charter', 'cargo charter', 'bulk carrier',
      'freight rate', 'laytime', 'demurrage', 'charter party', 'bill of lading',
      'cargo discharge', 'cargo loading', 'port operation', 'maritime transport',
      'dry bulk', 'wet bulk', 'fixture', 'tonnage', 'dwt', 'grt',
      
      // Turkish specific business terms
      'catering hizmeti', 'yemek servisi', 'organizasyon', 'düğün organizasyonu',
      'gemi kiralama', 'navlun oranı', 'liman operasyonu', 'yük taşımacılığı',
      
      // Your company specific
      'edessoy', 'chartering@edessoy.com', 'catering@edessoy.com',
      
      // Very specific commercial terms (but more restrictive)
      'charter agreement', 'catering contract', 'freight contract',
      'shipping invoice', 'catering invoice', 'maritime service'
    ];

    const searchText = `${message.subject || ''} ${message.from || ''} ${message.body || ''}`.toLowerCase();
    
    // Check if any business keyword exists
    const hasKeyword = businessKeywords.some(keyword => 
      searchText.includes(keyword.toLowerCase())
    );

    // Additional checks for email patterns
    const fromDomain = (message.from || '').toLowerCase();
    const isBusinessEmail = !fromDomain.includes('noreply') && 
                           !fromDomain.includes('no-reply') &&
                           !fromDomain.includes('newsletter') &&
                           !fromDomain.includes('marketing') &&
                           !fromDomain.includes('notification');

    // Blacklist - domains and terms to always exclude
    const blacklistedDomains = [
      'temu', 'amazon', 'aliexpress', 'ebay', 'shopify', 'alibaba',
      'newsletter', 'noreply', 'no-reply', 'marketing', 'promotions',
      'deals', 'offers', 'sales', 'discount', 'shopping', 'commerce'
    ];

    const isBlacklisted = blacklistedDomains.some(domain => 
      fromDomain.includes(domain) || searchText.includes(domain)
    );

    // Filter out obvious spam/promotional emails
    const subjectLower = (message.subject || '').toLowerCase();
    const isSpam = subjectLower.includes('unsubscribe') ||
                   subjectLower.includes('promotion') ||
                   subjectLower.includes('sale') ||
                   subjectLower.includes('offer') ||
                   subjectLower.includes('discount') ||
                   subjectLower.includes('%') ||
                   subjectLower.includes('free') ||
                   subjectLower.includes('win') ||
                   subjectLower.includes('prize') ||
                   subjectLower.includes('hediye') ||
                   subjectLower.includes('indirim') ||
                   subjectLower.includes('kampanya');

    return hasKeyword && isBusinessEmail && !isSpam && !isBlacklisted;
  }

  private async saveMessagesToDatabase(messages: EmailMessage[]): Promise<void> {
    try {
      for (const message of messages) {
        // Check if message already exists
        const existing = await prisma.inboundEmail.findFirst({
          where: {
            OR: [
              { messageId: `gmail-${message.id}` },
              { 
                AND: [
                  { fromAddr: message.from },
                  { subject: message.subject },
                  { receivedAt: message.date }
                ]
              }
            ]
          }
        });

        if (!existing) {
          await prisma.inboundEmail.create({
            data: {
              messageId: `gmail-${message.id}`,
              fromAddr: message.from,
              subject: message.subject,
              receivedAt: message.date,
              raw: message.body,
              parsedType: this.isCateringRelated(message) ? 'CARGO' : null,
              parsedJson: {
                id: message.id,
                to: message.to,
                html: message.html,
                attachments: message.attachments,
                source: 'gmail-imap'
              }
            }
          });
          
          logger.info(`Saved email to database: ${message.subject}`);
        } else {
          logger.debug(`Email already exists in database: ${message.subject}`);
        }
      }
    } catch (error) {
      logger.error('Error saving messages to database:', error);
    }
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