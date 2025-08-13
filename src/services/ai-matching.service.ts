import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

interface MatchingResult {
  score: number; // 0-100 percentage match
  reasons: string[];
  compatibility: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  concerns: string[];
  recommendations: string[];
}

interface CargoVesselPair {
  cargo: any;
  vessel: any;
  matching: MatchingResult;
}

export class AIMatchingService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzeMatch(cargo: any, vessel: any): Promise<MatchingResult> {
    try {
      const prompt = `
Analyze this cargo-vessel matching for maritime shipping:

CARGO DETAILS:
- Commodity: ${cargo.commodity || 'Unknown'}
- Quantity: ${cargo.qtyValue || 'Unknown'} ${cargo.qtyUnit || ''}
- Load Port: ${cargo.loadPort || 'Unknown'}
- Discharge Port: ${cargo.dischargePort || 'Unknown'}
- Laycan: ${cargo.laycanStart || 'Unknown'} to ${cargo.laycanEnd || 'Unknown'}
- Notes: ${cargo.notes || 'None'}

VESSEL DETAILS:
- Name: ${vessel.name || 'Unknown'}
- DWT: ${vessel.dwt || 'Unknown'}
- Capacity: ${vessel.capacityTon || 'Unknown'} tons
- Current Area: ${vessel.currentArea || 'Unknown'}
- Available From: ${vessel.availableFrom || 'Unknown'}
- Notes: ${vessel.notes || 'None'}

Analyze the compatibility based on:
1. Cargo size vs vessel capacity
2. Geographic positioning (ports vs vessel location)
3. Timing compatibility (laycan vs availability)
4. Vessel type suitability for commodity
5. Economic viability

Provide a detailed analysis with:
- Match score (0-100%)
- Compatibility level
- Positive matching factors
- Concerns or limitations
- Recommendations for improvement

Respond ONLY with valid JSON:
{
  "score": 85,
  "reasons": ["Good capacity match", "Vessel available in time"],
  "compatibility": "EXCELLENT" | "GOOD" | "FAIR" | "POOR",
  "concerns": ["Distance from load port"],
  "recommendations": ["Consider ballast costs", "Confirm vessel specifications"]
}
`;

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert maritime shipping analyst specializing in cargo-vessel matching. Analyze compatibility factors and provide detailed matching scores with practical recommendations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: parseFloat(process.env.EXTRACTION_TEMPERATURE || '0.1'),
        max_tokens: 800
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const result: MatchingResult = JSON.parse(content);
      
      logger.info(`AI analyzed cargo-vessel match: ${cargo.commodity} on ${vessel.name} - Score: ${result.score}%`);
      
      return result;

    } catch (error) {
      logger.error('AI matching analysis error:', error);
      
      // Fallback to simple rule-based matching
      return this.fallbackMatching(cargo, vessel);
    }
  }

  private fallbackMatching(cargo: any, vessel: any): MatchingResult {
    let score = 50; // Base score
    const reasons: string[] = [];
    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Basic capacity check
    if (cargo.qtyValue && vessel.capacityTon) {
      const utilization = (cargo.qtyValue / vessel.capacityTon) * 100;
      if (utilization >= 70 && utilization <= 100) {
        score += 20;
        reasons.push('Good capacity utilization');
      } else if (utilization < 50) {
        score -= 10;
        concerns.push('Low capacity utilization');
      } else if (utilization > 100) {
        score -= 30;
        concerns.push('Cargo exceeds vessel capacity');
      }
    }

    // Geographic proximity (basic check)
    if (cargo.loadPort && vessel.currentArea) {
      if (cargo.loadPort.toLowerCase().includes(vessel.currentArea.toLowerCase()) ||
          vessel.currentArea.toLowerCase().includes(cargo.loadPort.toLowerCase())) {
        score += 15;
        reasons.push('Vessel in proximity to load port');
      } else {
        score -= 5;
        concerns.push('Vessel may be distant from load port');
      }
    }

    // Determine compatibility level
    let compatibility: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    if (score >= 80) compatibility = 'EXCELLENT';
    else if (score >= 65) compatibility = 'GOOD';
    else if (score >= 50) compatibility = 'FAIR';
    else compatibility = 'POOR';

    recommendations.push('Verify vessel specifications');
    recommendations.push('Confirm loading/discharge arrangements');
    recommendations.push('Calculate ballast and positioning costs');

    return {
      score: Math.max(0, Math.min(100, score)),
      reasons,
      compatibility,
      concerns,
      recommendations
    };
  }

  async findBestMatches(cargoId?: number, vesselId?: number, limit: number = 10): Promise<CargoVesselPair[]> {
    try {
      let cargos: any[] = [];
      let vessels: any[] = [];

      if (cargoId) {
        // Find matches for specific cargo
        const cargo = await prisma.cargo.findUnique({ where: { id: cargoId } });
        if (!cargo) throw new Error('Cargo not found');
        cargos = [cargo];
        vessels = await prisma.vessel.findMany({ take: 20, orderBy: { createdAt: 'desc' } });
      } else if (vesselId) {
        // Find matches for specific vessel
        const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
        if (!vessel) throw new Error('Vessel not found');
        vessels = [vessel];
        cargos = await prisma.cargo.findMany({ take: 20, orderBy: { createdAt: 'desc' } });
      } else {
        // Find best overall matches
        cargos = await prisma.cargo.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
        vessels = await prisma.vessel.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
      }

      const matches: CargoVesselPair[] = [];

      for (const cargo of cargos) {
        for (const vessel of vessels) {
          const matching = await this.analyzeMatch(cargo, vessel);
          matches.push({ cargo, vessel, matching });
        }
      }

      // Sort by matching score and return top matches
      return matches
        .sort((a, b) => b.matching.score - a.matching.score)
        .slice(0, limit);

    } catch (error) {
      logger.error('Error finding matches:', error);
      throw error;
    }
  }

  async createMatch(cargoId: number, vesselId: number, manualScore?: number): Promise<any> {
    try {
      // Get cargo and vessel details
      const [cargo, vessel] = await Promise.all([
        prisma.cargo.findUnique({ where: { id: cargoId } }),
        prisma.vessel.findUnique({ where: { id: vesselId } })
      ]);

      if (!cargo || !vessel) {
        throw new Error('Cargo or vessel not found');
      }

      // Analyze match if score not provided
      let matchingResult: MatchingResult;
      if (manualScore !== undefined) {
        matchingResult = {
          score: manualScore,
          reasons: ['Manual match'],
          compatibility: manualScore >= 80 ? 'EXCELLENT' : manualScore >= 65 ? 'GOOD' : manualScore >= 50 ? 'FAIR' : 'POOR',
          concerns: [],
          recommendations: ['Review match details']
        };
      } else {
        matchingResult = await this.analyzeMatch(cargo, vessel);
      }

      // Create match record
      const match = await prisma.match.create({
        data: {
          cargoId,
          vesselId,
          status: 'SUGGESTED',
          score: matchingResult.score,
          reason: {
            score: matchingResult.score,
            compatibility: matchingResult.compatibility,
            reasons: matchingResult.reasons,
            concerns: matchingResult.concerns,
            recommendations: matchingResult.recommendations,
            analyzedAt: new Date().toISOString()
          } as any
        },
        include: {
          cargo: true,
          vessel: true
        }
      });

      logger.info(`Created match: Cargo ${cargoId} + Vessel ${vesselId} (Score: ${matchingResult.score}%)`);
      
      return match;

    } catch (error) {
      logger.error('Error creating match:', error);
      throw error;
    }
  }
}