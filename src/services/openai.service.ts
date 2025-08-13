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
  
  // Yeni alanlar
  cargoType: z.string().optional(),
  loadingType: z.string().optional(),
  loadingRate: z.number().optional(),
  dischargingRate: z.number().optional(),
  commission: z.number().optional(),
  vesselDwtMin: z.number().optional(),
  vesselDwtMax: z.number().optional(),
  vesselType: z.string().optional(),
  
  // İlave detaylar
  charterer: z.string().optional(),
  freightIdea: z.string().optional(),
  maxAge: z.number().optional(),
  excludeFlags: z.string().optional(),
  craneCap: z.string().optional(),
  specialRequirements: z.string().optional(),
  vesselShape: z.string().optional(),
  maxDiameter: z.number().optional(),
  maxLength: z.number().optional(),
  transshipment: z.boolean().optional(),
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
  
  // Yeni vessel alanları
  vesselType: z.string().optional(),
  builtYear: z.number().optional(),
  flag: z.string().optional(),
  loa: z.number().optional(),
  beam: z.number().optional(),
  draft: z.number().optional(),
  grt: z.number().optional(),
  nrt: z.number().optional(),
  holds: z.number().optional(),
  hatches: z.number().optional(),
  cranes: z.string().optional(),
  teu: z.number().optional(),
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
    "notes": "any additional requirements",
    "cargoType": "PET/steel coil/wheat/iron ore",
    "loadingType": "break bulk/container/bulk/bagged",
    "loadingRate": 3000,
    "dischargingRate": 2500,
    "commission": 3.75,
    "vesselDwtMin": 27000,
    "vesselDwtMax": 47000,
    "vesselType": "Bulk Carrier/Container/General Cargo",
    "charterer": "Interpipe",
    "freightIdea": "low 50",
    "maxAge": 25,
    "excludeFlags": "Iran/Iraq",
    "craneCap": "4x30 MT SWL",
    "specialRequirements": "SOLO CARGO, NO SIDE SHORING",
    "vesselShape": "box-shaped",
    "maxDiameter": 280,
    "maxLength": 13600,
    "transshipment": false
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
    "notes": "any additional info",
    "vesselType": "Bulk Carrier/Container/General Cargo",
    "builtYear": 2009,
    "flag": "Panama",
    "loa": 99.98,
    "beam": 15.8,
    "draft": 6.0,
    "grt": 2976,
    "nrt": 2073,
    "holds": 2,
    "hatches": 2,
    "cranes": "gearless",
    "teu": 265
  }
}

VESSEL Classification Guide:
- "Need X dwt for..." = VESSEL seeking cargo
- "Vessel available..." = VESSEL offering services
- DWT mentions = usually VESSEL specifications
- "TC" / "Time Charter" = VESSEL charter terms
- Container specifications (20-40f cntnrs) = VESSEL cargo capacity
- Port positions/locations = VESSEL current position
- Daily rates (USD per day) = VESSEL charter rates

CARGO Classification Guide:
- "Cargo available..." = CARGO seeking transport
- "Shipment of..." = CARGO description
- "Loading from X to Y" = CARGO route
- Commodity names = CARGO type

Extraction Tips for CARGO:
- cargoType: Specific material like "PET granule", "steel coil", "wheat"
- loadingType: "break bulk", "container", "bulk", "bagged", "loose"
- loadingRate: Extract from "3000t/day", "3,000 tons per day"
- dischargingRate: Extract from "2500t/day", "2,500 tons per day"  
- commission: Extract from "3.75%", "comm 3.75", "%3.75"
- vesselDwtMin/Max: From "27,000-47,000 DWT", "Need 30k+ DWT"
- vesselType: "Bulk Carrier", "Container", "General Cargo", "Tanker"
- charterer: Company name like "Interpipe", "Firma (acnt): Interpipe"
- freightIdea: "low 50", "high 60", freight expectations
- maxAge: "max 25 years", "vessel age maximum 25"
- excludeFlags: "NO Iran/Iraq flag", "exclude Iran flag"
- craneCap: "4x30 MT SWL", "minimum 4x25 MT", crane capacity
- specialRequirements: "SOLO CARGO", "NO SIDE SHORING", special notes
- vesselShape: "box-shaped", "shaped vessel", hold shape requirements
- maxDiameter/Length: "max 280mm", "max 13.600mm", dimensional limits
- transshipment: "NO transshipment", "direct voyage only"

Extraction Tips for VESSEL:
- Extract DWT from patterns like "2.500 dwt", "Need 2500 DWT"
- Look for vessel names (MV, MT, SS prefixes)
- Container capacity from "20-40f cntnrs", "TEU", "FEU"
- Current location from port names, areas mentioned
- Charter terms like "TC", "voyage", "time charter"
- Availability dates from "available from", "ready", "open"
- vesselType: "Gen Cargo", "Bulk Carrier", "Container", "Tanker"
- builtYear: "Built 2009", "Built Year 2009", "2009/Wenling"
- flag: "Flag Panama", "Panamanian flag"
- LOA/Beam/Draft: "LOA 99.98 M", "Beam 15.8 M", "Draft 6.0 M"
- GRT/NRT: "Grt/Nrt 2976 / 2073", "GRT 2976", "NRT 2073"
- Holds/Hatches: "Ho/Ha 2/2", "2 holds", "2 hatches"
- TEU: "TEU 265", "265 TEU capacity"

Rules:
1. Return ONLY valid JSON matching the schema
2. Extract ONE type only (CARGO or VESSEL) - choose the primary subject
3. Include only fields with actual values from the email
4. Dates must be YYYY-MM-DD format
5. Numbers should be numeric values, not strings
6. If uncertain about a field, omit it rather than guess
7. For VESSEL emails, try to extract as much technical data as possible
8. Look for abbreviations: vsl=vessel, dwt=deadweight tonnage, cntnr=container`;
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
        cargo.cargoType || '',
        cargo.qtyValue ? `${cargo.qtyValue} ${cargo.qtyUnit || ''}` : '',
        cargo.loadPort,
        cargo.dischargePort,
        cargo.laycanStart ? `laycan ${cargo.laycanStart}` : '',
        cargo.laycanEnd && cargo.laycanEnd !== cargo.laycanStart ? `to ${cargo.laycanEnd}` : '',
        cargo.loadingType ? `loading ${cargo.loadingType}` : '',
        cargo.loadingRate ? `${cargo.loadingRate} t/day loading` : '',
        cargo.dischargingRate ? `${cargo.dischargingRate} t/day discharging` : '',
        cargo.vesselType ? `need ${cargo.vesselType}` : '',
        cargo.vesselDwtMin && cargo.vesselDwtMax ? `${cargo.vesselDwtMin}-${cargo.vesselDwtMax} dwt` : '',
        cargo.commission ? `comm ${cargo.commission}%` : '',
        cargo.charterer ? `charterer ${cargo.charterer}` : '',
        cargo.freightIdea || '',
        cargo.maxAge ? `max age ${cargo.maxAge}` : '',
        cargo.excludeFlags ? `no ${cargo.excludeFlags}` : '',
        cargo.craneCap || '',
        cargo.vesselShape || '',
        cargo.specialRequirements || '',
        cargo.maxDiameter ? `max dia ${cargo.maxDiameter}mm` : '',
        cargo.maxLength ? `max length ${cargo.maxLength}mm` : '',
        cargo.transshipment === false ? 'no transshipment' : '',
        cargo.notes || '',
      ].filter(Boolean);
      
      return parts.join(' ');
    } else {
      const vessel = data as VesselData;
      const parts = [
        vessel.name,
        vessel.vesselType || '',
        vessel.dwt ? `${vessel.dwt} dwt` : '',
        vessel.capacityTon ? `${vessel.capacityTon} ton capacity` : '',
        vessel.capacityM3 ? `${vessel.capacityM3} m3 capacity` : '',
        vessel.teu ? `${vessel.teu} teu` : '',
        vessel.currentArea,
        vessel.availableFrom ? `available ${vessel.availableFrom}` : '',
        vessel.gear,
        vessel.builtYear ? `built ${vessel.builtYear}` : '',
        vessel.flag ? `flag ${vessel.flag}` : '',
        vessel.loa ? `${vessel.loa}m loa` : '',
        vessel.beam ? `${vessel.beam}m beam` : '',
        vessel.draft ? `${vessel.draft}m draft` : '',
        vessel.holds && vessel.hatches ? `${vessel.holds}/${vessel.hatches} holds/hatches` : '',
        vessel.notes || '',
      ].filter(Boolean);
      
      return parts.join(' ');
    }
  }
}