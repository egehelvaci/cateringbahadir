import { Ollama } from 'ollama';
import { pipeline } from '@xenova/transformers';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

interface ParsedVesselData {
  name?: string;
  imo?: string;
  dwt?: number;
  capacity?: {
    grain?: number;
    bale?: number;
  };
  currentArea?: string;
  availableFrom?: Date;
  gear?: 'geared' | 'gearless';
}

interface ParsedCargoData {
  commodity: string;
  quantity?: {
    value: number;
    unit: 'ton' | 'm3' | 'unit';
  };
  loadPort?: string;
  dischargePort?: string;
  laycan?: {
    start: Date;
    end: Date;
  };
  constraints?: {
    maxDraft?: number;
    minGear?: boolean;
    specialRequirements?: string[];
  };
}

export class AIService {
  private ollama: Ollama;
  private embeddingPipeline: any = null;

  constructor() {
    this.ollama = new Ollama({
      host: process.env.OLLAMA_URL || 'http://localhost:11434',
    });
    this.initializeEmbedding();
  }

  private async initializeEmbedding() {
    try {
      this.embeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
      logger.info('Embedding pipeline initialized');
    } catch (error) {
      logger.error('Failed to initialize embedding pipeline:', error);
    }
  }

  async parseEmailToVessel(emailContent: string): Promise<ParsedVesselData | null> {
    try {
      const prompt = `Extract vessel information from the following email. Return a JSON object with these fields:
      - name: vessel name
      - imo: IMO number
      - dwt: deadweight tonnage (number only)
      - capacity: {grain: number, bale: number}
      - currentArea: current location/area
      - availableFrom: availability date (ISO format)
      - gear: "geared" or "gearless"
      
      Email content:
      ${emailContent}
      
      Return only valid JSON, no additional text:`;

      const response = await this.ollama.generate({
        model: process.env.OLLAMA_MODEL || 'llama3.1:8b-instruct-q4_0',
        prompt,
        format: 'json',
        stream: false,
      });

      const parsed = JSON.parse(response.response);
      
      if (parsed.availableFrom) {
        parsed.availableFrom = new Date(parsed.availableFrom);
      }

      return parsed;
    } catch (error) {
      logger.error('Error parsing vessel email:', error);
      return null;
    }
  }

  async parseEmailToCargo(emailContent: string): Promise<ParsedCargoData | null> {
    try {
      const prompt = `Extract cargo information from the following email. Return a JSON object with these fields:
      - commodity: cargo type/commodity name
      - quantity: {value: number, unit: "ton" or "m3" or "unit"}
      - loadPort: loading port name
      - dischargePort: discharge port name
      - laycan: {start: ISO date, end: ISO date}
      - constraints: {maxDraft: number, minGear: boolean, specialRequirements: array of strings}
      
      Email content:
      ${emailContent}
      
      Return only valid JSON, no additional text:`;

      const response = await this.ollama.generate({
        model: process.env.OLLAMA_MODEL || 'llama3.1:8b-instruct-q4_0',
        prompt,
        format: 'json',
        stream: false,
      });

      const parsed = JSON.parse(response.response);
      
      if (parsed.laycan?.start) {
        parsed.laycan.start = new Date(parsed.laycan.start);
      }
      if (parsed.laycan?.end) {
        parsed.laycan.end = new Date(parsed.laycan.end);
      }

      return parsed;
    } catch (error) {
      logger.error('Error parsing cargo email:', error);
      return null;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!this.embeddingPipeline) {
        throw new Error('Embedding pipeline not initialized');
      }

      const output = await this.embeddingPipeline(text, {
        pooling: 'mean',
        normalize: true,
      });

      return Array.from(output.data);
    } catch (error) {
      logger.error('Error generating embedding:', error);
      return [];
    }
  }


  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async generateMatchReason(vessel: any, cargo: any, score: number): Promise<string> {
    try {
      const prompt = `Generate a brief explanation for why this vessel and cargo are matched with a score of ${score.toFixed(2)}.
      
      Vessel: ${vessel.name}, DWT: ${vessel.dwt}, Area: ${vessel.currentArea}, Available: ${vessel.availableFrom}
      Cargo: ${cargo.commodity}, Qty: ${cargo.qtyValue} ${cargo.qtyUnit}, Route: ${cargo.loadPort?.name} to ${cargo.dischargePort?.name}
      
      Provide a concise reason (max 2 sentences):`;

      const response = await this.ollama.generate({
        model: process.env.OLLAMA_MODEL || 'llama3.1:8b-instruct-q4_0',
        prompt,
        stream: false,
      });

      return response.response.trim();
    } catch (error) {
      logger.error('Error generating match reason:', error);
      return 'Match based on compatibility scores';
    }
  }
}