import { prisma } from '../../config/database';
import { AdvancedEmailClassifier } from './advancedClassifier';
import { InformationExtractor } from './informationExtractor';
import { EmailPreprocessor } from './emailPreprocessor';

interface ProcessingResult {
  processed: number;
  cargo: number;
  vessel: number;
  other: number;
  errors: number;
}

export class EmailProcessor {
  private classifier: AdvancedEmailClassifier;
  private extractor: InformationExtractor;
  private preprocessor: EmailPreprocessor;

  constructor() {
    this.classifier = new AdvancedEmailClassifier();
    this.extractor = new InformationExtractor();
    this.preprocessor = new EmailPreprocessor();
  }

  /**
   * Process all unprocessed emails and save classified ones to Cargo/Vessel tables
   */
  async processAllEmails(): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      processed: 0,
      cargo: 0,
      vessel: 0,
      other: 0,
      errors: 0
    };

    try {
      // Get all emails from last month that haven't been processed
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const emails = await prisma.inboundEmail.findMany({
        where: {
          createdAt: {
            gte: oneMonthAgo
          },
          // Don't re-process emails that already have cargo/vessel records
          AND: [
            {
              cargo: {
                none: {}
              }
            },
            {
              vessel: {
                none: {}
              }
            }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      console.log(`📧 Found ${emails.length} emails to process from last month`);

      for (const email of emails) {
        try {
          await this.processSingleEmail(email, result);
          result.processed++;
        } catch (error) {
          console.error(`❌ Error processing email ${email.id}:`, error);
          result.errors++;
        }
      }

      console.log(`✅ Processing completed: ${result.processed} emails processed`);
      console.log(`📊 Results: ${result.cargo} cargo, ${result.vessel} vessel, ${result.other} other`);

      return result;
    } catch (error) {
      console.error('💥 Fatal error in email processing:', error);
      throw error;
    }
  }

  /**
   * Process a single email
   */
  private async processSingleEmail(email: any, result: ProcessingResult): Promise<void> {
    if (!email.subject && !email.raw) {
      console.log(`⚠️  Skipping email ${email.id} - no content`);
      return;
    }

    const emailText = `${email.subject || ''} ${email.raw || ''}`;
    
    // Step 1: Preprocess email
    const preprocessed = await this.preprocessor.preprocess(emailText);
    
    // Step 2: Classify email
    const classification = this.classifier.classify(preprocessed.cleanedText);
    
    console.log(`📧 Email ${email.id}: ${email.subject?.substring(0, 50)}...`);
    console.log(`   🤖 Classified as: ${classification.label} (${(classification.confidence * 100).toFixed(1)}% confidence)`);

    // Update email with classification
    await prisma.inboundEmail.update({
      where: { id: email.id },
      data: {
        parsedType: classification.label === 'OTHER' ? null : classification.label as any,
        parsedJson: {
          classification: {
            type: classification.label,
            confidence: classification.confidence,
            probabilities: classification.probabilities
          },
          preprocessing: {
            detectedPorts: preprocessed.detectedPorts,
            detectedDates: preprocessed.detectedDates,
            detectedVesselNames: preprocessed.detectedVesselNames,
            detectedUnits: Array.from(preprocessed.detectedUnits.entries())
          }
        }
      }
    });

    // Step 3: Extract detailed information and save to appropriate table
    if (classification.label === 'CARGO' && classification.confidence > 0.6) {
      await this.saveCargoData(email, preprocessed, classification);
      result.cargo++;
    } else if (classification.label === 'VESSEL' && classification.confidence > 0.6) {
      await this.saveVesselData(email, preprocessed, classification);
      result.vessel++;
    } else {
      result.other++;
    }
  }

  /**
   * Save cargo data to Cargo table
   */
  private async saveCargoData(email: any, preprocessed: any, classification: any): Promise<void> {
    try {
      const cargoInfo = this.extractor.extractCargoInfo(preprocessed.cleanedText);
      
      // Prepare cargo data
      const cargoData = {
        emailId: email.id,
        commodity: cargoInfo.cargo_type || 'Unknown',
        qtyValue: cargoInfo.quantity_ton,
        qtyUnit: 'MT',
        loadPort: cargoInfo.load_ports?.[0],
        dischargePort: cargoInfo.discharge_ports?.[0],
        laycanStart: this.parseDate(cargoInfo.laycan_start),
        laycanEnd: this.parseDate(cargoInfo.laycan_end),
        cargoType: cargoInfo.cargo_type,
        freightIdea: cargoInfo.freight_rate,
        specialRequirements: JSON.stringify(cargoInfo.requirements),
        extractedData: cargoInfo as any,
        confidence: classification.confidence,
        notes: `Auto-extracted from email: ${email.subject}`
      };

      await prisma.cargo.create({
        data: cargoData
      });

      console.log(`   💼 Saved cargo: ${cargoInfo.cargo_type || 'Unknown'} - ${cargoInfo.quantity_ton || 'N/A'} MT`);
    } catch (error) {
      console.error(`❌ Error saving cargo data for email ${email.id}:`, error);
      throw error;
    }
  }

  /**
   * Save vessel data to Vessel table
   */
  private async saveVesselData(email: any, preprocessed: any, classification: any): Promise<void> {
    try {
      const vesselInfo = this.extractor.extractVesselInfo(preprocessed.cleanedText);
      
      // Prepare vessel data
      const vesselData = {
        emailId: email.id,
        name: vesselInfo.vessel_name,
        imo: vesselInfo.imo,
        dwt: vesselInfo.dwt,
        vesselType: vesselInfo.vessel_type,
        builtYear: vesselInfo.year_built,
        flag: vesselInfo.flag,
        loa: vesselInfo.loa,
        beam: vesselInfo.beam,
        draft: vesselInfo.draft,
        holds: vesselInfo.holds,
        hatches: vesselInfo.hatches,
        cranes: vesselInfo.crane_capacity,
        currentArea: vesselInfo.current_position,
        availableFrom: this.parseDate(vesselInfo.next_open),
        gear: vesselInfo.geared ? 'Geared' : 'Gearless',
        extractedData: vesselInfo as any,
        confidence: classification.confidence,
        notes: `Auto-extracted from email: ${email.subject}`
      };

      await prisma.vessel.create({
        data: vesselData
      });

      console.log(`   🚢 Saved vessel: ${vesselInfo.vessel_name || 'Unknown'} - ${vesselInfo.dwt || 'N/A'} DWT`);
    } catch (error) {
      console.error(`❌ Error saving vessel data for email ${email.id}:`, error);
      throw error;
    }
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateString?: string): Date | undefined {
    if (!dateString) return undefined;
    
    try {
      // Simple date parsing - in production use a proper date parser
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  }

  /**
   * Process emails from last N days
   */
  async processRecentEmails(days: number = 30): Promise<ProcessingResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result: ProcessingResult = {
      processed: 0,
      cargo: 0,
      vessel: 0,
      other: 0,
      errors: 0
    };

    const emails = await prisma.inboundEmail.findMany({
      where: {
        createdAt: {
          gte: cutoffDate
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📅 Processing ${emails.length} emails from last ${days} days`);

    for (const email of emails) {
      try {
        await this.processSingleEmail(email, result);
        result.processed++;
      } catch (error) {
        console.error(`❌ Error processing email ${email.id}:`, error);
        result.errors++;
      }
    }

    return result;
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<any> {
    const [totalEmails, cargoCount, vesselCount, processedEmails] = await Promise.all([
      prisma.inboundEmail.count(),
      prisma.cargo.count(),
      prisma.vessel.count(),
      prisma.inboundEmail.count({
        where: {
          parsedType: {
            not: null
          }
        }
      })
    ]);

    return {
      totalEmails,
      processedEmails,
      cargoCount,
      vesselCount,
      processingRate: totalEmails > 0 ? (processedEmails / totalEmails * 100) : 0
    };
  }
}