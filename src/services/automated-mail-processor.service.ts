import { prisma } from '../config/database';
import { logger } from '../utils/logger';
// AI services removed - no longer needed

interface ProcessingStats {
  processed: number;
  cargoCreated: number;
  vesselCreated: number;
  errors: number;
  skipped: number;
}

export class AutomatedMailProcessorService {
  private isProcessing: boolean = false;

  constructor() {
    // AI services removed - no longer needed
  }

  /**
   * Start automatic mail processing with cron job
   */
  startAutomaticProcessing(): void {
    logger.info('Automated mail processor disabled - AI processing removed');
  }

  /**
   * Process all unprocessed emails from InboundEmail table
   */
  async processAllUnprocessedEmails(): Promise<ProcessingStats> {
    if (this.isProcessing) {
      logger.warn('Mail processing already in progress, skipping...');
      return { processed: 0, cargoCreated: 0, vesselCreated: 0, errors: 0, skipped: 0 };
    }

    this.isProcessing = true;
    const stats: ProcessingStats = {
      processed: 0,
      cargoCreated: 0,
      vesselCreated: 0,
      errors: 0,
      skipped: 0
    };

    try {
      // Get unprocessed emails
      const unprocessedEmails = await prisma.inboundEmail.findMany({
        where: {
          parsedType: null,
          raw: { not: null },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100, // Process in batches
      });

      logger.info(`Found ${unprocessedEmails.length} unprocessed emails`);

      for (const email of unprocessedEmails) {
        try {
          const result = await this.processSingleEmail(email);
          
          if (result.processed) {
            stats.processed++;
            if (result.type === 'CARGO') stats.cargoCreated++;
            if (result.type === 'VESSEL') stats.vesselCreated++;
          } else {
            stats.skipped++;
          }

        } catch (error) {
          logger.error(`Error processing email ${email.id}:`, error);
          stats.errors++;
        }
      }

      logger.info(`Processing completed: ${stats.processed} processed, ${stats.cargoCreated} cargo, ${stats.vesselCreated} vessels, ${stats.errors} errors, ${stats.skipped} skipped`);
      
      return stats;

    } catch (error) {
      logger.error('Error in automated mail processing:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single email with enhanced classification
   */
  private async processSingleEmail(email: any): Promise<{ processed: boolean; type?: 'CARGO' | 'VESSEL' }> {
    try {
      if (!email.raw || !email.subject) {
        logger.debug(`Email ${email.id} missing required content, skipping`);
        return { processed: false };
      }

      // Step 1: Enhanced AI Classification
      const classification = await this.enhancedClassification(email);
      
      if (!classification || classification.type === 'UNKNOWN' || classification.confidence < 0.4) {
        logger.debug(`Email ${email.id} classification uncertain (${classification?.type}, confidence: ${classification?.confidence})`);
        
        // Update as NULL for low confidence
        await prisma.inboundEmail.update({
          where: { id: email.id },
          data: {
            parsedType: null,
            parsedJson: classification ? {
              classification: classification,
              reason: 'Low confidence classification'
            } as any : null,
          },
        });
        
        return { processed: false };
      }

      // Step 2: Extract structured data
      const extractedData = await this.extractStructuredData(email, classification.type);
      
      // Step 3: Save to appropriate table
      const saved = await this.saveToDatabase(email.id, classification.type, extractedData, classification);

      if (saved) {
        // Step 4: Update InboundEmail record
        await prisma.inboundEmail.update({
          where: { id: email.id },
          data: {
            parsedType: classification.type,
            parsedJson: {
              classification: classification,
              extractedData: extractedData,
              processedAt: new Date().toISOString()
            },
          },
        });

        logger.info(`Successfully processed email ${email.id} as ${classification.type} (confidence: ${classification.confidence})`);
        return { processed: true, type: classification.type };
      }

      return { processed: false };

    } catch (error) {
      logger.error(`Error processing single email ${email.id}:`, error);
      throw error;
    }
  }

  /**
   * Enhanced classification using multiple methods
   */
  private async enhancedClassification(email: any): Promise<{ type: 'CARGO' | 'VESSEL' | 'UNKNOWN'; confidence: number; method: string; extractedData?: any }> {
    const subject = email.subject || '';
    const body = email.raw || '';
    const fromAddr = email.fromAddr || '';

    try {
      // Method 1: Custom ML Model
      const mlClassifier = getEmailClassifier();
      const mlResult = mlClassifier.classifyEmail(subject, body, fromAddr);
      
      logger.debug(`ML Classification: ${mlResult.type} (confidence: ${mlResult.confidence})`);

      // Method 2: OpenAI Classification with better prompting
      let aiResult = null;
      try {
        aiResult = await this.aiClassification.classifyEmail(subject, body, fromAddr);
        logger.debug(`AI Classification: ${aiResult.type} (confidence: ${aiResult.confidence})`);
      } catch (error) {
        logger.warn('AI classification failed, using ML only:', error);
      }

      // Combine results with weighted scoring
      let finalType: 'CARGO' | 'VESSEL' | 'UNKNOWN';
      let finalConfidence: number;
      let method: string;

      if (mlResult.confidence > 0.8) {
        // High ML confidence - use ML result
        finalType = mlResult.type;
        finalConfidence = mlResult.confidence;
        method = 'ML_HIGH_CONFIDENCE';
      } else if (aiResult && aiResult.confidence > 0.7) {
        // High AI confidence - use AI result
        finalType = aiResult.type as 'CARGO' | 'VESSEL';
        finalConfidence = aiResult.confidence;
        method = 'AI_HIGH_CONFIDENCE';
      } else if (aiResult && mlResult.type === aiResult.type) {
        // Both agree - combine confidence
        finalType = mlResult.type;
        finalConfidence = Math.min((mlResult.confidence + aiResult.confidence) / 2 * 1.2, 0.95);
        method = 'ML_AI_CONSENSUS';
      } else if (mlResult.confidence > 0.5) {
        // Medium ML confidence, use ML
        finalType = mlResult.type;
        finalConfidence = mlResult.confidence * 0.9; // Slight penalty for disagreement
        method = 'ML_MEDIUM_CONFIDENCE';
      } else if (aiResult && aiResult.confidence > 0.5) {
        // Medium AI confidence, use AI
        finalType = aiResult.type as 'CARGO' | 'VESSEL';
        finalConfidence = aiResult.confidence * 0.9;
        method = 'AI_MEDIUM_CONFIDENCE';
      } else {
        // Low confidence from both
        finalType = 'UNKNOWN';
        finalConfidence = 0.1;
        method = 'LOW_CONFIDENCE';
      }

      return {
        type: finalType,
        confidence: finalConfidence,
        method: method,
        extractedData: aiResult?.extractedData
      };

    } catch (error) {
      logger.error('Enhanced classification error:', error);
      
      // Fallback to simple keyword classification
      return this.fallbackKeywordClassification(subject, body);
    }
  }

  /**
   * Fallback keyword-based classification
   */
  private fallbackKeywordClassification(subject: string, body: string): { type: 'CARGO' | 'VESSEL' | 'UNKNOWN'; confidence: number; method: string } {
    const text = `${subject} ${body}`.toLowerCase();
    
    const cargoKeywords = ['cargo', 'commodity', 'loading', 'laycan', 'mt', 'tonnage', 'shipment'];
    const vesselKeywords = ['vessel', 'ship', 'dwt', 'available', 'open', 'charter', 'mv'];
    
    const cargoScore = cargoKeywords.filter(keyword => text.includes(keyword)).length;
    const vesselScore = vesselKeywords.filter(keyword => text.includes(keyword)).length;
    
    if (cargoScore > vesselScore && cargoScore > 0) {
      return { type: 'CARGO', confidence: Math.min(0.4 + (cargoScore * 0.1), 0.7), method: 'FALLBACK_KEYWORD' };
    } else if (vesselScore > cargoScore && vesselScore > 0) {
      return { type: 'VESSEL', confidence: Math.min(0.4 + (vesselScore * 0.1), 0.7), method: 'FALLBACK_KEYWORD' };
    } else {
      return { type: 'UNKNOWN', confidence: 0.1, method: 'FALLBACK_NO_KEYWORDS' };
    }
  }

  /**
   * Extract structured data based on classification type
   */
  private async extractStructuredData(email: any, type: 'CARGO' | 'VESSEL'): Promise<any> {
    try {
      const extraction = await this.openaiService.extractFromEmail(email.raw);
      
      if (extraction && extraction.type === type) {
        return extraction.data;
      }
      
      // If extraction doesn't match classification, try again with specific prompting
      return await this.extractWithSpecificPrompt(email, type);
      
    } catch (error) {
      logger.warn(`Data extraction failed for email ${email.id}:`, error);
      return null;
    }
  }

  /**
   * Extract data with type-specific prompting
   */
  private async extractWithSpecificPrompt(email: any, type: 'CARGO' | 'VESSEL'): Promise<any> {
    // This would use the OpenAI service with more specific prompts
    // For now, return basic structure
    if (type === 'CARGO') {
      return {
        commodity: this.extractCommodity(email.raw),
        notes: email.subject
      };
    } else {
      return {
        name: this.extractVesselName(email.raw),
        notes: email.subject
      };
    }
  }

  /**
   * Simple commodity extraction
   */
  private extractCommodity(text: string): string | null {
    const commodities = ['wheat', 'corn', 'coal', 'iron ore', 'steel', 'grain', 'rice', 'sugar'];
    const lowerText = text.toLowerCase();
    
    for (const commodity of commodities) {
      if (lowerText.includes(commodity)) {
        return commodity;
      }
    }
    return null;
  }

  /**
   * Simple vessel name extraction
   */
  private extractVesselName(text: string): string | null {
    const vesselMatch = text.match(/m\/?v\s+([a-zA-Z\s]+)/i);
    return vesselMatch ? vesselMatch[1].trim() : null;
  }

  /**
   * Save extracted data to appropriate database table
   */
  private async saveToDatabase(emailId: number, type: 'CARGO' | 'VESSEL', extractedData: any, classification: any): Promise<boolean> {
    try {
      if (type === 'CARGO') {
        await prisma.cargo.create({
          data: {
            emailId: emailId,
            commodity: extractedData?.commodity || 'Unknown',
            qtyValue: extractedData?.qtyValue || null,
            qtyUnit: extractedData?.qtyUnit || null,
            loadPort: extractedData?.loadPort || null,
            dischargePort: extractedData?.dischargePort || null,
            laycanStart: extractedData?.laycanStart ? new Date(extractedData.laycanStart) : null,
            laycanEnd: extractedData?.laycanEnd ? new Date(extractedData.laycanEnd) : null,
            notes: extractedData?.notes || null,
            confidence: classification.confidence,
            extractedData: extractedData
          },
        });
        
        logger.info(`Created cargo record for email ${emailId}: ${extractedData?.commodity || 'Unknown'}`);
        return true;

      } else if (type === 'VESSEL') {
        await prisma.vessel.create({
          data: {
            emailId: emailId,
            name: extractedData?.name || extractedData?.vesselName || null,
            imo: extractedData?.imo || null,
            dwt: extractedData?.dwt || null,
            capacityTon: extractedData?.capacity || extractedData?.capacityTon || null,
            currentArea: extractedData?.currentLocation || extractedData?.currentArea || null,
            availableFrom: extractedData?.availability || extractedData?.availableFrom ? 
              new Date(extractedData.availability || extractedData.availableFrom) : null,
            notes: extractedData?.notes || null,
            confidence: classification.confidence,
            extractedData: extractedData
          },
        });
        
        logger.info(`Created vessel record for email ${emailId}: ${extractedData?.name || extractedData?.vesselName || 'Unknown'}`);
        return true;
      }

      return false;

    } catch (error) {
      logger.error(`Error saving to database for email ${emailId}:`, error);
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
    unknownEmails: number;
  }> {
    const [
      totalEmails,
      processedEmails,
      unprocessedEmails,
      cargoCount,
      vesselCount,
      unknownEmails,
    ] = await Promise.all([
      prisma.inboundEmail.count(),
      prisma.inboundEmail.count({ 
        where: { 
          parsedType: { 
            in: ['CARGO', 'VESSEL'] 
          } 
        } 
      }),
      prisma.inboundEmail.count({ 
        where: { 
          parsedType: null 
        } 
      }),
      prisma.cargo.count(),
      prisma.vessel.count(),
      prisma.inboundEmail.count({ 
        where: { 
          AND: [
            { parsedType: null },
            { parsedJson: { not: {} } }
          ]
        } 
      }),
    ]);

    return {
      totalEmails,
      processedEmails,
      unprocessedEmails,
      cargoCount,
      vesselCount,
      unknownEmails,
    };
  }

  /**
   * Manually trigger processing (for testing or admin use)
   */
  async triggerManualProcessing(): Promise<ProcessingStats> {
    logger.info('Manual email processing triggered');
    return this.processAllUnprocessedEmails();
  }
}