const Imap = require('imap');
const { simpleParser } = require('mailparser');
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { AIClassificationService } from './ai-classification.service';
import { MailType } from '@prisma/client';

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
  private aiClassifier: AIClassificationService;

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
    
    this.aiClassifier = new AIClassificationService();
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
          // Use AI classification to determine email type
          let aiClassification = null;
          let emailType: MailType | null = null;
          
          if (this.isCateringRelated(message)) {
            try {
              aiClassification = await this.aiClassifier.classifyEmail(
                message.subject,
                message.body,
                message.from
              );
              
              emailType = aiClassification.type === 'UNKNOWN' ? null : 
                         (aiClassification.type === 'CARGO' ? MailType.CARGO : MailType.VESSEL);
              
              logger.info(`AI classified email "${message.subject}" as ${aiClassification.type} (confidence: ${aiClassification.confidence})`);
            } catch (error) {
              logger.error('AI classification failed, using fallback:', error);
              emailType = MailType.CARGO; // Default fallback
            }
          }

          const savedEmail = await prisma.inboundEmail.create({
            data: {
              messageId: `gmail-${message.id}`,
              fromAddr: message.from,
              subject: message.subject,
              receivedAt: message.date,
              raw: message.body,
              parsedType: emailType,
              parsedJson: {
                id: message.id,
                to: message.to,
                html: message.html,
                attachments: message.attachments,
                source: 'gmail-imap',
                aiClassification: aiClassification ? {
                  type: aiClassification.type,
                  confidence: aiClassification.confidence,
                  reason: aiClassification.reason,
                  extractedData: aiClassification.extractedData || {}
                } : null
              } as any
            }
          });

          // Create corresponding Cargo or Vessel record based on AI classification
          if (aiClassification && aiClassification.type !== 'UNKNOWN') {
            await this.createCargoOrVesselRecord(savedEmail.id, aiClassification, message);
          }
          
          logger.info(`Saved email to database: ${message.subject} (Type: ${emailType})`);
        } else {
          logger.debug(`Email already exists in database: ${message.subject}`);
        }
      }
    } catch (error) {
      logger.error('Error saving messages to database:', error);
    }
  }

  private async createCargoOrVesselRecord(_emailId: number, classification: any, message: any): Promise<void> {
    try {
      if (classification.type === 'CARGO') {
        await prisma.cargo.create({
          data: {
            commodity: classification.extractedData?.commodity || 'Unknown',
            qtyValue: this.parseQuantity(classification.extractedData?.quantity),
            qtyUnit: this.parseQuantityUnit(classification.extractedData?.quantity),
            loadPort: classification.extractedData?.loadPort || null,
            dischargePort: classification.extractedData?.dischargePort || null,
            laycanStart: this.parseDate(classification.extractedData?.laycan, 'start'),
            laycanEnd: this.parseDate(classification.extractedData?.laycan, 'end'),
            notes: `Auto-extracted from email: ${message.subject}\nFrom: ${message.from}\nConfidence: ${classification.confidence}`
          }
        });
        
        logger.info(`Created Cargo record for email: ${message.subject}`);
        
      } else if (classification.type === 'VESSEL') {
        await prisma.vessel.create({
          data: {
            name: classification.extractedData?.vesselName || 'Unknown Vessel',
            imo: classification.extractedData?.imo || null,
            dwt: this.parseNumber(classification.extractedData?.dwt),
            capacityTon: this.parseNumber(classification.extractedData?.capacity),
            currentArea: classification.extractedData?.currentLocation || null,
            availableFrom: this.parseDate(classification.extractedData?.availability, 'start'),
            notes: `Auto-extracted from email: ${message.subject}\nFrom: ${message.from}\nConfidence: ${classification.confidence}`
          }
        });
        
        logger.info(`Created Vessel record for email: ${message.subject}`);
      }
    } catch (error) {
      logger.error('Error creating cargo/vessel record:', error);
    }
  }

  private parseQuantity(quantityStr: string | undefined): number | null {
    if (!quantityStr) return null;
    const match = quantityStr.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  private parseQuantityUnit(quantityStr: string | undefined): string | null {
    if (!quantityStr) return null;
    const units = ['mt', 'tons', 'tonnes', 'kg', 'lbs'];
    const unit = units.find(u => quantityStr.toLowerCase().includes(u));
    return unit || 'mt';
  }

  private parseNumber(numberStr: string | undefined): number | null {
    if (!numberStr) return null;
    const match = numberStr.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  private parseDate(dateStr: string | undefined, type: 'start' | 'end'): Date | null {
    if (!dateStr) return null;
    
    // Simple date parsing - can be enhanced
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Look for patterns like "15-20 Sep", "Sept 15-20", etc.
    const monthMatch = dateStr.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    const dayMatch = dateStr.match(/(\d{1,2})-(\d{1,2})/);
    
    if (monthMatch && dayMatch) {
      const monthStr = monthMatch[1].toLowerCase();
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const month = months.indexOf(monthStr);
      
      if (month !== -1) {
        const startDay = parseInt(dayMatch[1]);
        const endDay = parseInt(dayMatch[2]);
        const day = type === 'start' ? startDay : endDay;
        
        return new Date(currentYear, month, day);
      }
    }
    
    return null;
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