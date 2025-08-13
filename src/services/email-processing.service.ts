import { prisma } from '../config/database';
import { AIClassificationService } from './ai-classification.service';
import { OpenAIService } from './openai.service';
import { logger } from '../utils/logger';

export class EmailProcessingService {
  private aiClassification: AIClassificationService;
  private openaiService: OpenAIService;

  constructor() {
    this.aiClassification = new AIClassificationService();
    this.openaiService = new OpenAIService();
  }

  /**
   * Process unprocessed emails in the InboundEmail table
   */
  async processUnprocessedEmails(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      // Find emails that haven't been processed yet (no parsedType)
      const unprocessedEmails = await prisma.inboundEmail.findMany({
        where: {
          parsedType: null,
          raw: { not: null },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50, // Process in batches to avoid overwhelming the system
      });

      logger.info(`Found ${unprocessedEmails.length} unprocessed emails`);

      for (const email of unprocessedEmails) {
        try {
          await this.processEmailRecord(email);
          processed++;
        } catch (error) {
          logger.error(`Error processing email ${email.id}:`, error);
          errors++;
        }
      }

      logger.info(`Email processing completed: ${processed} processed, ${errors} errors`);

      return { processed, errors };
    } catch (error) {
      logger.error('Error in batch email processing:', error);
      throw error;
    }
  }

  /**
   * Process a single email record
   */
  async processEmailRecord(email: any): Promise<void> {
    try {
      if (!email.raw) {
        logger.warn(`Email ${email.id} has no raw content, skipping`);
        return;
      }

      // AI classification to determine CARGO or VESSEL
      const classification = await this.aiClassification.classifyEmail(
        email.subject || '',
        email.raw,
        email.fromAddr || ''
      );

      let parsedJson = null;

      if (classification.type !== 'UNKNOWN' && classification.confidence > 0.6) {
        try {
          // Extract structured data using OpenAI
          const extraction = await this.openaiService.extractFromEmail(email.raw);
          parsedJson = extraction;

          // Save to appropriate table (Cargo or Vessel)
          await this.saveToSpecificTable(extraction);

          logger.info(`Successfully classified and saved ${classification.type} from email ${email.id}`);
        } catch (extractError) {
          logger.warn(`Failed to extract structured data from email ${email.id}:`, extractError);
          // Continue with just the classification
        }
      } else {
        logger.debug(`Email ${email.id} classification uncertain (${classification.type}, confidence: ${classification.confidence})`);
      }

      // Update the email record with classification results
      await prisma.inboundEmail.update({
        where: { id: email.id },
        data: {
          parsedType: classification.type !== 'UNKNOWN' ? classification.type : null,
          parsedJson: parsedJson as any,
        },
      });

    } catch (error) {
      logger.error(`Error processing email record ${email.id}:`, error);
      throw error;
    }
  }

  /**
   * Save extracted data to specific table (Cargo or Vessel)
   */
  private async saveToSpecificTable(extraction: any): Promise<void> {
    try {
      if (extraction.type === 'CARGO') {
        const cargoData = extraction.data;

        // Generate embedding for matching
        const embeddingText = this.openaiService.generateEmbeddingText('CARGO', cargoData);
        const embedding = await this.openaiService.generateEmbedding(embeddingText);

        await prisma.cargo.create({
          data: {
            commodity: cargoData.commodity,
            qtyValue: cargoData.qtyValue || null,
            qtyUnit: cargoData.qtyUnit || null,
            loadPort: cargoData.loadPort || null,
            dischargePort: cargoData.dischargePort || null,
            laycanStart: cargoData.laycanStart ? new Date(cargoData.laycanStart) : null,
            laycanEnd: cargoData.laycanEnd ? new Date(cargoData.laycanEnd) : null,
            notes: cargoData.notes || null,
            embedding: Buffer.from(new Float32Array(embedding).buffer),
          },
        });

        logger.info(`Saved cargo: ${cargoData.commodity} from ${cargoData.loadPort} to ${cargoData.dischargePort}`);

      } else if (extraction.type === 'VESSEL') {
        const vesselData = extraction.data;

        // Generate embedding for matching
        const embeddingText = this.openaiService.generateEmbeddingText('VESSEL', vesselData);
        const embedding = await this.openaiService.generateEmbedding(embeddingText);

        await prisma.vessel.create({
          data: {
            name: vesselData.name || null,
            imo: vesselData.imo || null,
            dwt: vesselData.dwt || null,
            capacityTon: vesselData.capacityTon || null,
            capacityM3: vesselData.capacityM3 || null,
            currentArea: vesselData.currentArea || null,
            availableFrom: vesselData.availableFrom ? new Date(vesselData.availableFrom) : null,
            gear: vesselData.gear || null,
            notes: vesselData.notes || null,
            embedding: Buffer.from(new Float32Array(embedding).buffer),
          },
        });

        logger.info(`Saved vessel: ${vesselData.name || 'Unknown'} (${vesselData.dwt || 'N/A'} DWT) in ${vesselData.currentArea || 'Unknown area'}`);
      }
    } catch (error) {
      logger.error('Error saving to specific table:', error);
      throw error;
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    totalEmails: number;
    processedEmails: number;
    unprocessedEmails: number;
    cargoCount: number;
    vesselCount: number;
  }> {
    const [
      totalEmails,
      processedEmails,
      unprocessedEmails,
      cargoCount,
      vesselCount,
    ] = await Promise.all([
      prisma.inboundEmail.count(),
      prisma.inboundEmail.count({ where: { parsedType: { not: null } } }),
      prisma.inboundEmail.count({ where: { parsedType: null } }),
      prisma.cargo.count(),
      prisma.vessel.count(),
    ]);

    return {
      totalEmails,
      processedEmails,
      unprocessedEmails,
      cargoCount,
      vesselCount,
    };
  }
}
