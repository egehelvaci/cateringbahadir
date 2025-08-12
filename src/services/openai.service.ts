import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Cargo Schema
const CargoSchema = z.object({
  commodity: z.string().min(1),
  qtyValue: z.number().optional(),
  qtyUnit: z.string().optional(),
  loadPort: z.string().optional(),
  dischargePort: z.string().optional(),
  laycanStart: z.string().optional().refine((date) => {
    if (!date) return true;
    return !isNaN(Date.parse(date));
  }, { message: "Invalid date format" }),
  laycanEnd: z.string().optional().refine((date) => {
    if (!date) return true;
    return !isNaN(Date.parse(date));
  }, { message: "Invalid date format" }),
  notes: z.string().optional(),
});

// Vessel Schema
const VesselSchema = z.object({
  name: z.string().optional(),
  imo: z.string().optional(),
  dwt: z.number().optional(),
  capacityTon: z.number().optional(),
  capacityM3: z.number().optional(),
  currentArea: z.string().optional(),
  availableFrom: z.string().optional().refine((date) => {
    if (!date) return true;
    return !isNaN(Date.parse(date));
  }, { message: "Invalid date format" }),
  gear: z.string().optional(),
  notes: z.string().optional(),
});

// Extraction Result Schema
const ExtractionResultSchema = z.object({
  type: z.enum(['CARGO', 'VESSEL']),
  data: z.union([CargoSchema, VesselSchema]),
});

export type CargoData = z.infer<typeof CargoSchema>;
export type VesselData = z.infer<typeof VesselSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export class OpenAIService {
  private client: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async extractFromEmail(emailText: string): Promise<ExtractionResult> {
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`OpenAI extraction attempt ${attempt}/${maxRetries}`);

        const response = await this.client.chat.completions.create({
          model: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini',
          temperature: parseFloat(process.env.EXTRACTION_TEMPERATURE || '0'),
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: `Please extract information from this email and determine if it's about CARGO or VESSEL:\n\n${emailText}`,
            },
          ],
          response_format: {
            type: 'json_object',
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content received from OpenAI');
        }

        const parsed = JSON.parse(content);
        const validated = ExtractionResultSchema.parse(parsed);

        // Normalize dates
        if (validated.type === 'CARGO') {
          const cargoData = validated.data as CargoData;
          if (cargoData.laycanStart) {
            cargoData.laycanStart = this.normalizeDate(cargoData.laycanStart);
          }
          if (cargoData.laycanEnd) {
            cargoData.laycanEnd = this.normalizeDate(cargoData.laycanEnd);
          }
          // If only one date provided, set both start and end
          if (cargoData.laycanStart && !cargoData.laycanEnd) {
            cargoData.laycanEnd = cargoData.laycanStart;
          }
          // Normalize quantities
          if (cargoData.qtyValue && cargoData.qtyUnit) {
            const normalized = this.normalizeQuantity(cargoData.qtyValue, cargoData.qtyUnit);
            cargoData.qtyValue = normalized.value;
            cargoData.qtyUnit = normalized.unit;
          }
        } else {
          const vesselData = validated.data as VesselData;
          if (vesselData.availableFrom) {
            vesselData.availableFrom = this.normalizeDate(vesselData.availableFrom);
          }
        }

        logger.info(`Successfully extracted ${validated.type} data`);
        return validated;

      } catch (error) {
        lastError = error;
        logger.error(`OpenAI extraction attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw error;
    }
  }

  private getSystemPrompt(): string {
    return `You are an expert maritime broker assistant. Extract cargo or vessel information from emails and return JSON in this format:

For CARGO:
{
  "type": "CARGO",
  "data": {
    "commodity": "grain/coal/steel/etc",
    "qtyValue": 25000,
    "qtyUnit": "ton/m3/unit",
    "loadPort": "Hamburg",
    "dischargePort": "Shanghai",
    "laycanStart": "2025-01-15",
    "laycanEnd": "2025-01-20",
    "notes": "any additional requirements"
  }
}

For VESSEL:
{
  "type": "VESSEL",
  "data": {
    "name": "MV Example",
    "imo": "1234567",
    "dwt": 75000,
    "capacityTon": 70000,
    "capacityM3": 85000,
    "currentArea": "Mediterranean",
    "availableFrom": "2025-01-10",
    "gear": "geared/gearless",
    "notes": "any additional info"
  }
}

Rules:
1. Return ONLY valid JSON matching the schema
2. Extract ONE type only (CARGO or VESSEL) - choose the primary subject
3. Include only fields with actual values from the email
4. Dates must be YYYY-MM-DD format
5. Numbers should be numeric values, not strings
6. If uncertain about a field, omit it rather than guess`;
  }

  private normalizeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch {
      return dateStr; // Return original if parsing fails
    }
  }

  private normalizeQuantity(value: number, unit: string): { value: number; unit: string } {
    const lowerUnit = unit.toLowerCase();
    
    // Convert common abbreviations
    if (lowerUnit.includes('k') && lowerUnit.includes('t')) {
      // 25k ton -> 25000 ton
      return { value: value * 1000, unit: 'ton' };
    }
    
    if (lowerUnit.includes('cbm') || lowerUnit.includes('cubic')) {
      return { value, unit: 'm3' };
    }
    
    if (lowerUnit.includes('ton') || lowerUnit.includes('mt')) {
      return { value, unit: 'ton' };
    }
    
    return { value, unit };
  }

  // Generate text for embedding from cargo/vessel data
  generateEmbeddingText(type: 'CARGO' | 'VESSEL', data: CargoData | VesselData): string {
    if (type === 'CARGO') {
      const cargo = data as CargoData;
      const parts = [
        cargo.commodity,
        cargo.qtyValue ? `${cargo.qtyValue} ${cargo.qtyUnit || ''}` : '',
        cargo.loadPort,
        cargo.dischargePort,
        cargo.laycanStart ? `laycan ${cargo.laycanStart}` : '',
        cargo.laycanEnd && cargo.laycanEnd !== cargo.laycanStart ? `to ${cargo.laycanEnd}` : '',
        cargo.notes || '',
      ].filter(Boolean);
      
      return parts.join(' ');
    } else {
      const vessel = data as VesselData;
      const parts = [
        vessel.name,
        vessel.dwt ? `${vessel.dwt} dwt` : '',
        vessel.capacityTon ? `${vessel.capacityTon} ton capacity` : '',
        vessel.capacityM3 ? `${vessel.capacityM3} m3 capacity` : '',
        vessel.currentArea,
        vessel.availableFrom ? `available ${vessel.availableFrom}` : '',
        vessel.gear,
        vessel.notes || '',
      ].filter(Boolean);
      
      return parts.join(' ');
    }
  }
}