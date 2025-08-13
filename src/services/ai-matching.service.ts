import { prisma } from '../config/database';
import { OpenAIService } from './openai.service';
import { MatchingV2Service } from './matching-v2.service';
import { logger } from '../utils/logger';

interface AIMatchAnalysis {
  compatibility: number; // 0-100
  reasoning: string;
  locationAnalysis: {
    score: number;
    explanation: string;
  };
  timingAnalysis: {
    score: number;
    explanation: string;
  };
  cargoAnalysis: {
    score: number;
    explanation: string;
  };
  recommendations: string[];
  risks: string[];
}

export class AIMatchingService {
  private openaiService: OpenAIService;
  private matchingV2Service: MatchingV2Service;

  constructor() {
    this.openaiService = new OpenAIService();
    this.matchingV2Service = new MatchingV2Service();
  }

  /**
   * Yeni cargo eklendiğinde otomatik matching başlat
   */
  async triggerMatchingForNewCargo(cargoId: number): Promise<void> {
    try {
      logger.info(`Starting automatic matching for new cargo ${cargoId}`);
      
      // Önce mevcut algoritma ile match'ler bul
      const algorithmicMatches = await this.matchingV2Service.findTopMatchesForCargo(cargoId, 5);
      
      // Her match için AI analizi yap
      for (const match of algorithmicMatches) {
        if (match.score > 30) { // Sadece threshold üzeri match'leri analiz et
          await this.enhanceMatchWithAI(match.cargoId, match.vesselId);
        }
      }
      
      // En iyi match'leri kullanıcıya bildir
      await this.notifyBestMatches(cargoId, algorithmicMatches);
      
    } catch (error) {
      logger.error(`Error in automatic matching for cargo ${cargoId}:`, error);
    }
  }

  /**
   * Yeni vessel eklendiğinde otomatik matching başlat
   */
  async triggerMatchingForNewVessel(vesselId: number): Promise<void> {
    try {
      logger.info(`Starting automatic matching for new vessel ${vesselId}`);
      
      // Önce mevcut algoritma ile match'ler bul
      const algorithmicMatches = await this.matchingV2Service.findTopMatchesForVessel(vesselId, 5);
      
      // Her match için AI analizi yap
      for (const match of algorithmicMatches) {
        if (match.score > 30) {
          await this.enhanceMatchWithAI(match.cargoId, match.vesselId);
        }
      }
      
      // En iyi match'leri kullanıcıya bildir
      await this.notifyBestMatches(vesselId, algorithmicMatches, 'vessel');
      
    } catch (error) {
      logger.error(`Error in automatic matching for vessel ${vesselId}:`, error);
    }
  }

  /**
   * GPT ile match analizi yap ve mevcut match'i geliştir
   */
  private async enhanceMatchWithAI(cargoId: number, vesselId: number): Promise<void> {
    try {
      const [cargo, vessel] = await Promise.all([
        prisma.cargo.findUnique({ where: { id: cargoId } }),
        prisma.vessel.findUnique({ where: { id: vesselId } })
      ]);

      if (!cargo || !vessel) {
        logger.warn(`Missing cargo ${cargoId} or vessel ${vesselId} for AI analysis`);
        return;
      }

      const aiAnalysis = await this.performAIAnalysis(cargo, vessel);
      
      // Mevcut match'i AI analizi ile güncelle
      await this.updateMatchWithAIAnalysis(cargoId, vesselId, aiAnalysis);
      
    } catch (error) {
      logger.error(`Error enhancing match with AI for cargo ${cargoId}, vessel ${vesselId}:`, error);
    }
  }

  /**
   * GPT ile detaylı match analizi yap
   */
  private async performAIAnalysis(cargo: any, vessel: any): Promise<AIMatchAnalysis> {
    try {
      const prompt = this.buildAnalysisPrompt(cargo, vessel);
      
      const response = await this.openaiService['client'].chat.completions.create({
        model: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert maritime broker analyzing cargo-vessel compatibility. Provide detailed analysis focusing on location, timing, and cargo compatibility. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const analysis: AIMatchAnalysis = JSON.parse(content);
      
      // Validate and sanitize response
      return {
        compatibility: Math.max(0, Math.min(100, analysis.compatibility || 0)),
        reasoning: analysis.reasoning || 'No reasoning provided',
        locationAnalysis: analysis.locationAnalysis || { score: 0, explanation: 'No analysis' },
        timingAnalysis: analysis.timingAnalysis || { score: 0, explanation: 'No analysis' },
        cargoAnalysis: analysis.cargoAnalysis || { score: 0, explanation: 'No analysis' },
        recommendations: analysis.recommendations || [],
        risks: analysis.risks || []
      };

    } catch (error) {
      logger.error('Error performing AI analysis:', error);
      
      // Fallback analysis
      return {
        compatibility: 50,
        reasoning: 'AI analysis failed, using basic compatibility assessment',
        locationAnalysis: { score: 50, explanation: 'Unable to analyze location compatibility' },
        timingAnalysis: { score: 50, explanation: 'Unable to analyze timing compatibility' },
        cargoAnalysis: { score: 50, explanation: 'Unable to analyze cargo compatibility' },
        recommendations: ['Manual review recommended due to AI analysis failure'],
        risks: ['AI analysis unavailable - verify manually']
      };
    }
  }

  private buildAnalysisPrompt(cargo: any, vessel: any): string {
    return `
Analyze the compatibility between this cargo and vessel for maritime shipping:

CARGO DETAILS:
- Commodity: ${cargo.commodity}
- Quantity: ${cargo.qtyValue} ${cargo.qtyUnit || 'units'}
- Load Port: ${cargo.loadPort || 'Not specified'}
- Discharge Port: ${cargo.dischargePort || 'Not specified'}
- Laycan: ${cargo.laycanStart ? new Date(cargo.laycanStart).toISOString().split('T')[0] : 'Not specified'} to ${cargo.laycanEnd ? new Date(cargo.laycanEnd).toISOString().split('T')[0] : 'Not specified'}
- Notes: ${cargo.notes || 'None'}

VESSEL DETAILS:
- Name: ${vessel.name || 'Not specified'}
- DWT: ${vessel.dwt || 'Not specified'}
- Capacity (Tons): ${vessel.capacityTon || 'Not specified'}
- Capacity (M3): ${vessel.capacityM3 || 'Not specified'}
- Current Area: ${vessel.currentArea || 'Not specified'}
- Available From: ${vessel.availableFrom ? new Date(vessel.availableFrom).toISOString().split('T')[0] : 'Not specified'}
- Gear: ${vessel.gear || 'Not specified'}
- Notes: ${vessel.notes || 'None'}

Provide analysis in this exact JSON format:
{
  "compatibility": 85,
  "reasoning": "Excellent match with optimal timing and location compatibility",
  "locationAnalysis": {
    "score": 90,
    "explanation": "Vessel currently in Mediterranean, ideal for loading from Italian port"
  },
  "timingAnalysis": {
    "score": 85,
    "explanation": "Vessel available 3 days before laycan start, perfect timing"
  },
  "cargoAnalysis": {
    "score": 80,
    "explanation": "Cargo utilizes 75% of vessel capacity, optimal loading"
  },
  "recommendations": [
    "Proceed with fixture negotiations",
    "Confirm exact vessel position",
    "Verify gear requirements"
  ],
  "risks": [
    "Weather delays possible in winter season",
    "Port congestion in discharge port"
  ]
}

Consider:
1. Location compatibility (vessel position vs load/discharge ports)
2. Timing (vessel availability vs laycan dates)
3. Cargo compatibility (size, type, special requirements)
4. Efficiency (utilization rates, distance optimization)
5. Market conditions and practical considerations

Assign scores 0-100 for each category and overall compatibility.
`;
  }

  /**
   * Match'i AI analizi ile güncelle
   */
  private async updateMatchWithAIAnalysis(cargoId: number, vesselId: number, aiAnalysis: AIMatchAnalysis): Promise<void> {
    try {
      const existingMatch = await prisma.match.findFirst({
        where: { cargoId, vesselId }
      });

      if (!existingMatch) {
        logger.warn(`No existing match found for cargo ${cargoId}, vessel ${vesselId}`);
        return;
      }

      // Combine existing reason with AI analysis
      const existingReason = existingMatch.reason as any || {};
      const enhancedReason = {
        ...existingReason,
        aiAnalysis: {
          compatibility: aiAnalysis.compatibility,
          reasoning: aiAnalysis.reasoning,
          breakdown: {
            location: aiAnalysis.locationAnalysis,
            timing: aiAnalysis.timingAnalysis,
            cargo: aiAnalysis.cargoAnalysis
          },
          recommendations: aiAnalysis.recommendations,
          risks: aiAnalysis.risks,
          analyzedAt: new Date().toISOString()
        }
      };

      // Update match with enhanced AI analysis
      await prisma.match.update({
        where: { id: existingMatch.id },
        data: {
          reason: enhancedReason,
          // Optionally adjust score based on AI analysis
          score: Math.round((existingMatch.score + aiAnalysis.compatibility) / 2)
        }
      });

      logger.info(`Enhanced match ${existingMatch.id} with AI analysis (${aiAnalysis.compatibility}% compatibility)`);

    } catch (error) {
      logger.error('Error updating match with AI analysis:', error);
    }
  }

  /**
   * En iyi match'leri kullanıcıya bildir (şimdilik log, sonra notification service)
   */
  private async notifyBestMatches(recordId: number, matches: any[], type: 'cargo' | 'vessel' = 'cargo'): Promise<void> {
    if (matches.length === 0) {
      logger.info(`No suitable matches found for ${type} ${recordId}`);
      return;
    }

    const bestMatch = matches[0];
    const goodMatches = matches.filter(m => m.score > 60);

    logger.info(`🎯 Best matches for ${type} ${recordId}:`);
    logger.info(`   Best: ${bestMatch.score}% (${type === 'cargo' ? `Vessel ${bestMatch.vesselId}` : `Cargo ${bestMatch.cargoId}`})`);
    logger.info(`   Total good matches (>60%): ${goodMatches.length}`);

    // TODO: Integrate with notification service
    // await notificationService.notifyNewMatches(recordId, type, goodMatches);
  }

  /**
   * Tüm pending match'leri yeniden analiz et
   */
  async reanalyzePendingMatches(): Promise<{ processed: number; enhanced: number }> {
    try {
      const pendingMatches = await prisma.match.findMany({
        where: {
          status: 'SUGGESTED',
          // AI analizi yapılmamış match'ler
          reason: {
            path: ['aiAnalysis'],
            equals: {}
          }
        },
        take: 20, // Batch processing
        include: {
          cargo: true,
          vessel: true
        }
      });

      let processed = 0;
      let enhanced = 0;

      for (const match of pendingMatches) {
        try {
          const aiAnalysis = await this.performAIAnalysis(match.cargo, match.vessel);
          await this.updateMatchWithAIAnalysis(match.cargoId, match.vesselId, aiAnalysis);
          processed++;
          
          if (aiAnalysis.compatibility > 70) {
            enhanced++;
          }
        } catch (error) {
          logger.error(`Error reanalyzing match ${match.id}:`, error);
        }
      }

      logger.info(`Reanalyzed ${processed} matches, ${enhanced} enhanced with high compatibility`);
      return { processed, enhanced };

    } catch (error) {
      logger.error('Error in batch reanalysis:', error);
      return { processed: 0, enhanced: 0 };
    }
  }

  /**
   * Find best matches for cargo or vessel
   */
  async findBestMatches(cargoId?: number, vesselId?: number, limit: number = 10): Promise<any[]> {
    try {
      if (cargoId) {
        return await this.matchingV2Service.findTopMatchesForCargo(cargoId, limit);
      } else if (vesselId) {
        return await this.matchingV2Service.findTopMatchesForVessel(vesselId, limit);
      } else {
        // Return general best matches
        return await prisma.match.findMany({
          where: { status: 'SUGGESTED' },
          orderBy: { score: 'desc' },
          take: limit,
          include: {
            cargo: true,
            vessel: true
          }
        });
      }
    } catch (error) {
      logger.error('Error finding best matches:', error);
      return [];
    }
  }

  /**
   * Create a new match between cargo and vessel
   */
  async createMatch(cargoId: number, vesselId: number, score?: number, reason?: any): Promise<any> {
    try {
      // If no score provided, calculate it
      let finalScore = score;
      if (finalScore === undefined) {
        const [cargo, vessel] = await Promise.all([
          prisma.cargo.findUnique({ where: { id: cargoId } }),
          prisma.vessel.findUnique({ where: { id: vesselId } })
        ]);
        
        if (cargo && vessel) {
          const analysis = await this.performAIAnalysis(cargo, vessel);
          finalScore = analysis.compatibility;
          reason = reason || analysis.reasoning;
        } else {
          finalScore = 50; // Default score
        }
      }

      return await prisma.match.create({
        data: {
          cargoId,
          vesselId,
          score: finalScore,
          reason: reason as any,
          status: 'SUGGESTED'
        },
        include: {
          cargo: true,
          vessel: true
        }
      });
    } catch (error) {
      logger.error('Error creating match:', error);
      throw error;
    }
  }

  /**
   * Analyze match compatibility between cargo and vessel
   */
  async analyzeMatch(cargo: any, vessel: any): Promise<AIMatchAnalysis> {
    try {
      return await this.performAIAnalysis(cargo, vessel);
    } catch (error) {
      logger.error('Error analyzing match:', error);
      throw error;
    }
  }

  /**
   * Match kalitesini değerlendir
   */
  async getMatchQualityMetrics(): Promise<{
    totalMatches: number;
    aiEnhanced: number;
    highQuality: number;
    averageCompatibility: number;
  }> {
    try {
      const [
        totalMatches,
        aiEnhanced,
        allMatches
      ] = await Promise.all([
        prisma.match.count(),
        prisma.match.count({
          where: {
            reason: {
              path: ['aiAnalysis', 'compatibility'],
              gte: 0
            }
          }
        }),
        prisma.match.findMany({
          where: {
            reason: {
              path: ['aiAnalysis', 'compatibility'],
              gte: 0
            }
          },
          select: {
            reason: true,
            score: true
          }
        })
      ]);

      const compatibilityScores = allMatches
        .map(m => (m.reason as any)?.aiAnalysis?.compatibility)
        .filter(score => typeof score === 'number');

      const averageCompatibility = compatibilityScores.length > 0 ?
        compatibilityScores.reduce((sum, score) => sum + score, 0) / compatibilityScores.length : 0;

      const highQuality = compatibilityScores.filter(score => score > 75).length;

      return {
        totalMatches,
        aiEnhanced,
        highQuality,
        averageCompatibility: Math.round(averageCompatibility)
      };

    } catch (error) {
      logger.error('Error getting match quality metrics:', error);
      return {
        totalMatches: 0,
        aiEnhanced: 0,
        highQuality: 0,
        averageCompatibility: 0
      };
    }
  }
}