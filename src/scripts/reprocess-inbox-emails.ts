import { prisma } from '../config/database';
import { AIClassificationService } from '../services/ai-classification.service';
import { OpenAIService } from '../services/openai.service';
import { AIMatchingService } from '../services/ai-matching.service';
import { logger } from '../utils/logger';

async function reprocessInboxEmails() {
  const aiClassifier = new AIClassificationService();
  const openaiService = new OpenAIService();
  const aiMatchingService = new AIMatchingService();

  try {
    logger.info('Starting inbox email reprocessing...');

    // Get all emails from inbox
    const allEmails = await prisma.inboundEmail.findMany({
      orderBy: { receivedAt: 'desc' }
    });

    logger.info(`Found ${allEmails.length} emails to reprocess`);

    let processedCount = 0;
    let newCargoCount = 0;
    let newVesselCount = 0;
    let errorCount = 0;

    for (const email of allEmails) {
      try {
        logger.info(`Processing email ${email.id}: "${email.subject}"`);

        // Skip if no content
        if (!email.raw || !email.subject || !email.fromAddr) {
          logger.debug(`Skipping email ${email.id} - missing content`);
          continue;
        }

        // Classify email using AI
        const classification = await aiClassifier.classifyEmail(
          email.subject,
          email.raw,
          email.fromAddr
        );

        logger.info(`Email ${email.id} classified as ${classification.type} with confidence ${classification.confidence}`);

        // If classification is confident enough, extract and save data
        if (classification.type !== 'UNKNOWN' && classification.confidence > 0.25) {
          try {
            // Extract structured data using OpenAI
            const extraction = await openaiService.extractFromEmail(email.raw);
            
            logger.info(`Successfully extracted ${extraction.type} data from email ${email.id}`);

            // Update email record with new classification
            await prisma.inboundEmail.update({
              where: { id: email.id },
              data: {
                parsedType: classification.type,
                parsedJson: {
                  ...email.parsedJson as any,
                  reprocessed: true,
                  reprocessedAt: new Date().toISOString(),
                  aiClassification: {
                    type: classification.type,
                    confidence: classification.confidence,
                    reason: classification.reason,
                    extractedData: extraction
                  }
                }
              }
            });

            // Save to specific table (Cargo or Vessel)
            if (extraction.type === 'CARGO') {
              const cargoData = extraction.data as any;
              
              // Generate embedding for matching
              const embeddingText = openaiService.generateEmbeddingText('CARGO', cargoData);
              const embedding = await openaiService.generateEmbedding(embeddingText);

              const savedCargo = await prisma.cargo.create({
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
                  
                  // Yeni alanlar
                  cargoType: cargoData.cargoType || null,
                  loadingType: cargoData.loadingType || null,
                  loadingRate: cargoData.loadingRate || null,
                  dischargingRate: cargoData.dischargingRate || null,
                  commission: cargoData.commission || null,
                  vesselDwtMin: cargoData.vesselDwtMin || null,
                  vesselDwtMax: cargoData.vesselDwtMax || null,
                  vesselType: cargoData.vesselType || null,
                  
                  // İlave detaylar
                  charterer: cargoData.charterer || null,
                  freightIdea: cargoData.freightIdea || null,
                  maxAge: cargoData.maxAge || null,
                  excludeFlags: cargoData.excludeFlags || null,
                  craneCap: cargoData.craneCap || null,
                  specialRequirements: cargoData.specialRequirements || null,
                  vesselShape: cargoData.vesselShape || null,
                  maxDiameter: cargoData.maxDiameter || null,
                  maxLength: cargoData.maxLength || null,
                  transshipment: cargoData.transshipment || null,
                },
              });

              newCargoCount++;
              logger.info(`Created cargo ${savedCargo.id}: ${cargoData.commodity} from email ${email.id}`);

              // Trigger automatic matching
              setImmediate(() => {
                aiMatchingService.triggerMatchingForNewCargo(savedCargo.id)
                  .catch(error => logger.error('Auto-matching failed for cargo:', error));
              });

            } else if (extraction.type === 'VESSEL') {
              const vesselData = extraction.data as any;
              
              // Generate embedding for matching
              const embeddingText = openaiService.generateEmbeddingText('VESSEL', vesselData);
              const embedding = await openaiService.generateEmbedding(embeddingText);

              const savedVessel = await prisma.vessel.create({
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
                  
                  // Yeni vessel alanları
                  vesselType: vesselData.vesselType || null,
                  builtYear: vesselData.builtYear || null,
                  flag: vesselData.flag || null,
                  loa: vesselData.loa || null,
                  beam: vesselData.beam || null,
                  draft: vesselData.draft || null,
                  grt: vesselData.grt || null,
                  nrt: vesselData.nrt || null,
                  holds: vesselData.holds || null,
                  hatches: vesselData.hatches || null,
                  cranes: vesselData.cranes || null,
                  teu: vesselData.teu || null,
                },
              });

              newVesselCount++;
              logger.info(`Created vessel ${savedVessel.id}: ${vesselData.name || 'Unknown'} from email ${email.id}`);

              // Trigger automatic matching
              setImmediate(() => {
                aiMatchingService.triggerMatchingForNewVessel(savedVessel.id)
                  .catch(error => logger.error('Auto-matching failed for vessel:', error));
              });
            }

          } catch (extractError) {
            logger.warn(`Failed to extract structured data from email ${email.id}:`, extractError);
            // Continue with just the classification
            await prisma.inboundEmail.update({
              where: { id: email.id },
              data: {
                parsedType: classification.type,
                parsedJson: {
                  ...email.parsedJson as any,
                  reprocessed: true,
                  reprocessedAt: new Date().toISOString(),
                  aiClassification: {
                    type: classification.type,
                    confidence: classification.confidence,
                    reason: classification.reason,
                    extractionError: extractError instanceof Error ? extractError.message : String(extractError)
                  }
                }
              }
            });
          }
        } else {
          logger.debug(`Email ${email.id} classification uncertain or unknown`);
          await prisma.inboundEmail.update({
            where: { id: email.id },
            data: {
              parsedType: null,
              parsedJson: {
                ...email.parsedJson as any,
                reprocessed: true,
                reprocessedAt: new Date().toISOString(),
                aiClassification: {
                  type: classification.type,
                  confidence: classification.confidence,
                  reason: classification.reason
                }
              }
            }
          });
        }

        processedCount++;

        // Add a small delay to avoid overwhelming the APIs
        if (processedCount % 10 === 0) {
          logger.info(`Processed ${processedCount}/${allEmails.length} emails...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second pause
        }

      } catch (error) {
        errorCount++;
        logger.error(`Error processing email ${email.id}:`, error);
        continue;
      }
    }

    logger.info('='.repeat(60));
    logger.info('REPROCESSING COMPLETE!');
    logger.info(`Total emails processed: ${processedCount}`);
    logger.info(`New cargo records created: ${newCargoCount}`);
    logger.info(`New vessel records created: ${newVesselCount}`);
    logger.info(`Errors encountered: ${errorCount}`);
    logger.info('='.repeat(60));

  } catch (error) {
    logger.error('Critical error in reprocessing:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  reprocessInboxEmails()
    .then(() => {
      logger.info('Reprocessing script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Reprocessing script failed:', error);
      process.exit(1);
    });
}

export { reprocessInboxEmails };