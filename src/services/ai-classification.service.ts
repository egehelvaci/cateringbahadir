import OpenAI from 'openai';
import { logger } from '../utils/logger';

interface EmailClassification {
  type: 'CARGO' | 'VESSEL' | 'UNKNOWN';
  confidence: number;
  reason: string;
  extractedData?: {
    // For CARGO emails
    commodity?: string;
    quantity?: string;
    loadPort?: string;
    dischargePort?: string;
    laycan?: string;
    
    // For VESSEL emails  
    vesselName?: string;
    imo?: string;
    dwt?: string;
    capacity?: string;
    currentLocation?: string;
    availability?: string;
  };
}

export class AIClassificationService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async classifyEmail(subject: string, body: string, fromAddr: string): Promise<EmailClassification> {
    try {
      const prompt = `
Analyze this email and classify it as either CARGO (cargo/commodity seeking vessel) or VESSEL (vessel seeking cargo).

Email Details:
- From: ${fromAddr}
- Subject: ${subject}
- Body: ${body.substring(0, 1000)}

Classification Rules:
1. CARGO: Emails about commodities, goods, cargo seeking vessels for transport
   - Keywords: cargo, commodity, grain, coal, iron ore, steel, wheat, corn, soybeans, bulk, shipment
   - Phrases: "cargo available", "seeking vessel", "looking for ship", "tonnage required"

2. VESSEL: Emails about ships/vessels seeking cargo or offering vessel services
   - Keywords: vessel, ship, tanker, bulker, dwt, ballast, open, available, vsl, tonnage, charter, tc, cntnr, container
   - Phrases: "vessel available", "seeking cargo", "ship open", "vessel positioning", "need [tonnage] dwt", "offer vessel"
   - Common formats: "Need X dwt for...", "Vessel available...", "TC basis", "Time Charter"

Extract relevant data:
- For CARGO: commodity, quantity, load/discharge ports, laycan dates
- For VESSEL: vessel name, IMO, DWT, capacity, current location, availability dates

Respond ONLY with valid JSON in this format:
{
  "type": "CARGO" | "VESSEL" | "UNKNOWN",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation",
  "extractedData": {
    "commodity": "wheat",
    "quantity": "50000mt",
    "loadPort": "Houston",
    "dischargePort": "Rotterdam",
    "laycan": "15-20 Sep"
  }
}
`;

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in maritime shipping and cargo classification. Analyze emails to determine if they are about CARGO seeking vessels or VESSELS seeking cargo. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: parseFloat(process.env.EXTRACTION_TEMPERATURE || '0'),
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      const classification: EmailClassification = JSON.parse(content);
      
      logger.info(`Email classified as ${classification.type} with ${classification.confidence} confidence`);
      
      return classification;

    } catch (error) {
      logger.error('AI classification error:', error);
      
      // Fallback to simple keyword classification
      return this.fallbackClassification(subject, body);
    }
  }

  private fallbackClassification(subject: string, body: string): EmailClassification {
    const text = `${subject} ${body}`.toLowerCase();
    
    const cargoKeywords = [
      'cargo', 'commodity', 'grain', 'coal', 'iron ore', 'wheat', 'corn', 'soybean', 'rice', 'barley',
      'seeking vessel', 'tonnage required', 'shipment', 'bulk', 'tonnage', 'mt', 'metric ton',
      'steel', 'scrap', 'fertilizer', 'cement', 'sugar', 'salt', 'feed', 'pellets',
      'load', 'loading', 'discharge', 'unload', 'laycan', 'cif', 'fob'
    ];
    const vesselKeywords = [
      'vessel', 'ship', 'dwt', 'ballast', 'vessel available', 'seeking cargo', 'ship open',
      'mv ', 'ss ', 'bulker', 'tanker', 'handymax', 'supramax', 'panamax', 'capesize',
      'built', 'flag', 'imo', 'loa', 'beam', 'draft', 'holds', 'hatches', 'crane', 'gear',
      'vsl', 'tonnage', 'tc', 'time charter', 'voyage charter', 'charter', 'charterer',
      'container', 'cntnr', 'teu', 'feu', 'reefer', 'dry cargo', 'general cargo'
    ];
    
    const cargoScore = cargoKeywords.filter(keyword => text.includes(keyword)).length;
    const vesselScore = vesselKeywords.filter(keyword => text.includes(keyword)).length;
    
    if (cargoScore > vesselScore && cargoScore > 0) {
      return {
        type: 'CARGO',
        confidence: Math.min(0.4 + (cargoScore * 0.1), 0.9),
        reason: `Fallback keyword-based classification detected cargo-related content (${cargoScore} keywords)`
      };
    } else if (vesselScore > cargoScore && vesselScore > 0) {
      return {
        type: 'VESSEL', 
        confidence: Math.min(0.4 + (vesselScore * 0.1), 0.9),
        reason: `Fallback keyword-based classification detected vessel-related content (${vesselScore} keywords)`
      };
    } else if (cargoScore > 0 || vesselScore > 0) {
      // If we have some keywords but can't distinguish clearly, default to CARGO
      const totalScore = cargoScore + vesselScore;
      return {
        type: 'CARGO',
        confidence: Math.min(0.3 + (totalScore * 0.05), 0.6),
        reason: `Mixed maritime content detected, defaulting to cargo (cargo: ${cargoScore}, vessel: ${vesselScore})`
      };
    } else {
      return {
        type: 'UNKNOWN',
        confidence: 0.1,
        reason: 'Could not determine if email is about cargo or vessel'
      };
    }
  }
}