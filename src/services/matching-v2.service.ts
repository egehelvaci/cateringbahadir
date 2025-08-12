import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface MatchScore {
  vesselId: number;
  cargoId: number;
  score: number;
  reasons: string[];
  embeddingScore: number;
  ruleScores: {
    dateScore: number;
    capacityScore: number;
    geographyScore: number;
    constraintScore: number;
  };
}

export class MatchingV2Service {
  async findTopMatchesForCargo(cargoId: number, limit: number = 3): Promise<MatchScore[]> {
    try {
      const cargo = await prisma.cargo.findUnique({
        where: { id: cargoId },
      });

      if (!cargo) {
        throw new Error('Cargo not found');
      }

      const vessels = await prisma.vessel.findMany();
      const scores: MatchScore[] = [];

      for (const vessel of vessels) {
        const score = await this.calculateMatchScore(vessel, cargo);
        scores.push(score);
      }

      // Sort by score and return top matches
      const topMatches = scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Save matches to database
      for (const match of topMatches) {
        await this.saveMatch(match);
      }

      return topMatches;
    } catch (error) {
      logger.error('Error finding matches for cargo:', error);
      return [];
    }
  }

  async findTopMatchesForVessel(vesselId: number, limit: number = 3): Promise<MatchScore[]> {
    try {
      const vessel = await prisma.vessel.findUnique({
        where: { id: vesselId },
      });

      if (!vessel) {
        throw new Error('Vessel not found');
      }

      const cargos = await prisma.cargo.findMany();
      const scores: MatchScore[] = [];

      for (const cargo of cargos) {
        const score = await this.calculateMatchScore(vessel, cargo);
        scores.push(score);
      }

      // Sort by score and return top matches
      const topMatches = scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Save matches to database
      for (const match of topMatches) {
        await this.saveMatch(match);
      }

      return topMatches;
    } catch (error) {
      logger.error('Error finding matches for vessel:', error);
      return [];
    }
  }

  private async calculateMatchScore(vessel: any, cargo: any): Promise<MatchScore> {
    const reasons: string[] = [];
    
    // 1. Embedding similarity (0-20 points)
    const embeddingScore = await this.calculateEmbeddingScore(vessel, cargo);
    if (embeddingScore > 15) {
      reasons.push(`High semantic similarity (${embeddingScore.toFixed(1)}/20)`);
    } else if (embeddingScore > 10) {
      reasons.push(`Good semantic similarity (${embeddingScore.toFixed(1)}/20)`);
    }

    // 2. Date compatibility (0-30 points)
    const dateScore = this.calculateDateScore(vessel, cargo);
    if (dateScore > 20) {
      reasons.push(`Excellent timing match (${dateScore}/30)`);
    } else if (dateScore > 10) {
      reasons.push(`Good timing match (${dateScore}/30)`);
    } else if (dateScore < 0) {
      reasons.push(`Poor timing - vessel unavailable during laycan`);
    }

    // 3. Capacity compatibility (0-25 points)
    const capacityScore = this.calculateCapacityScore(vessel, cargo);
    if (capacityScore > 18) {
      reasons.push(`Optimal cargo utilization`);
    } else if (capacityScore > 10) {
      reasons.push(`Good cargo utilization`);
    } else if (capacityScore < 0) {
      reasons.push(`Cargo exceeds vessel capacity`);
    }

    // 4. Geography match (0-15 points)
    const geographyScore = this.calculateGeographyScore(vessel, cargo);
    if (geographyScore > 10) {
      reasons.push(`Vessel in optimal position`);
    } else if (geographyScore > 5) {
      reasons.push(`Vessel reasonably positioned`);
    }

    // 5. Constraint compatibility (0-10 points)
    const constraintScore = this.calculateConstraintScore(vessel, cargo);
    if (constraintScore < 0) {
      reasons.push(`Vessel does not meet cargo requirements`);
    } else if (constraintScore > 5) {
      reasons.push(`Vessel meets all requirements`);
    }

    const totalScore = Math.max(0, Math.min(100, 
      embeddingScore + dateScore + capacityScore + geographyScore + constraintScore
    ));

    return {
      vesselId: vessel.id,
      cargoId: cargo.id,
      score: totalScore,
      reasons,
      embeddingScore,
      ruleScores: {
        dateScore,
        capacityScore,
        geographyScore,
        constraintScore,
      },
    };
  }

  private async calculateEmbeddingScore(vessel: any, cargo: any): Promise<number> {
    try {
      if (!vessel.embedding || !cargo.embedding) {
        return 0;
      }

      // Convert bytes back to float arrays
      const vesselEmbedding = new Float32Array(vessel.embedding.buffer);
      const cargoEmbedding = new Float32Array(cargo.embedding.buffer);

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(
        Array.from(vesselEmbedding),
        Array.from(cargoEmbedding)
      );

      // Convert similarity (-1 to 1) to score (0-20)
      return Math.max(0, (similarity + 1) * 10);
    } catch (error) {
      logger.error('Error calculating embedding score:', error);
      return 0;
    }
  }

  private calculateDateScore(vessel: any, cargo: any): number {
    if (!vessel.availableFrom || !cargo.laycanStart || !cargo.laycanEnd) {
      return 5; // Neutral score if dates missing
    }

    const vesselAvailable = new Date(vessel.availableFrom);
    const laycanStart = new Date(cargo.laycanStart);
    const laycanEnd = new Date(cargo.laycanEnd);

    // Perfect match - vessel available during laycan
    if (vesselAvailable >= laycanStart && vesselAvailable <= laycanEnd) {
      return 30;
    }

    // Early availability
    if (vesselAvailable < laycanStart) {
      const daysDiff = Math.floor((laycanStart.getTime() - vesselAvailable.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) return 25;
      if (daysDiff <= 14) return 20;
      if (daysDiff <= 30) return 15;
      return 10;
    }

    // Late availability
    if (vesselAvailable > laycanEnd) {
      const daysDiff = Math.floor((vesselAvailable.getTime() - laycanEnd.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 3) return 15;
      if (daysDiff <= 7) return 5;
      return -10; // Penalty for late availability
    }

    return 10;
  }

  private calculateCapacityScore(vessel: any, cargo: any): number {
    if (!vessel.dwt || !cargo.qtyValue) {
      return 10; // Neutral score if capacity data missing
    }

    let utilizationRate: number;

    if (cargo.qtyUnit === 'm3' && vessel.capacityM3) {
      utilizationRate = cargo.qtyValue / vessel.capacityM3;
    } else {
      // Default to DWT comparison
      utilizationRate = cargo.qtyValue / vessel.dwt;
    }

    // Optimal utilization (70-95%)
    if (utilizationRate >= 0.7 && utilizationRate <= 0.95) {
      return 25;
    }
    // Good utilization (50-70% or 95-100%)
    if ((utilizationRate >= 0.5 && utilizationRate < 0.7) || 
        (utilizationRate > 0.95 && utilizationRate <= 1.0)) {
      return 18;
    }
    // Acceptable utilization (30-50%)
    if (utilizationRate >= 0.3 && utilizationRate < 0.5) {
      return 12;
    }
    // Low utilization (10-30%)
    if (utilizationRate >= 0.1 && utilizationRate < 0.3) {
      return 6;
    }
    // Over capacity
    if (utilizationRate > 1.0) {
      return -25;
    }
    // Very low utilization
    return 2;
  }

  private calculateGeographyScore(vessel: any, cargo: any): number {
    if (!vessel.currentArea || !cargo.loadPort) {
      return 5; // Neutral score if geography data missing
    }

    const vesselArea = vessel.currentArea.toLowerCase();
    const loadPort = cargo.loadPort.toLowerCase();

    // Direct area matches
    const areaMatches = [
      ['mediterranean', 'med', 'italy', 'spain', 'greece', 'turkey'],
      ['black sea', 'romania', 'ukraine', 'bulgaria'],
      ['north sea', 'baltic', 'denmark', 'sweden', 'norway', 'germany'],
      ['far east', 'asia', 'china', 'japan', 'korea', 'singapore'],
      ['middle east', 'persian gulf', 'uae', 'saudi', 'kuwait'],
      ['atlantic', 'usa', 'canada', 'brazil', 'argentina'],
    ];

    for (const regions of areaMatches) {
      const vesselInRegion = regions.some(region => vesselArea.includes(region));
      const portInRegion = regions.some(region => loadPort.includes(region));
      
      if (vesselInRegion && portInRegion) {
        return 15; // Perfect regional match
      }
    }

    // Adjacent regions get partial score
    if (vesselArea.includes('med') && loadPort.includes('black')) return 10;
    if (vesselArea.includes('north') && loadPort.includes('baltic')) return 12;
    if (vesselArea.includes('far east') && loadPort.includes('singapore')) return 10;

    return 3; // Default low score for distant regions
  }

  private calculateConstraintScore(vessel: any, cargo: any): number {
    let score = 10; // Start with full points

    // Check gear requirements (if cargo has grain/bulk requiring geared)
    if (cargo.commodity) {
      const bulkCommodities = ['grain', 'wheat', 'corn', 'soybean', 'barley', 'fertilizer'];
      const needsGear = bulkCommodities.some(commodity => 
        cargo.commodity.toLowerCase().includes(commodity)
      );
      
      if (needsGear && vessel.gear && vessel.gear.toLowerCase().includes('gearless')) {
        score -= 8; // Major penalty for wrong gear
      } else if (needsGear && vessel.gear && vessel.gear.toLowerCase().includes('geared')) {
        score += 2; // Bonus for correct gear
      }
    }

    // Check vessel type compatibility
    if (cargo.commodity && vessel.name) {
      const vesselName = vessel.name.toLowerCase();
      const commodity = cargo.commodity.toLowerCase();
      
      // Tanker cargo on dry bulk vessel
      if ((commodity.includes('oil') || commodity.includes('chemical')) && 
          !vesselName.includes('tanker')) {
        return -10; // Invalid match
      }
      
      // Container cargo on bulk vessel
      if ((commodity.includes('container') || commodity.includes('teu')) && 
          vesselName.includes('bulk')) {
        return -10; // Invalid match
      }
    }

    return score;
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
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async saveMatch(matchScore: MatchScore): Promise<void> {
    try {
      // Check if match already exists
      const existingMatch = await prisma.match.findFirst({
        where: {
          cargoId: matchScore.cargoId,
          vesselId: matchScore.vesselId,
        },
      });

      const matchData = {
        score: matchScore.score,
        reason: {
          text: matchScore.reasons.join('; '),
          embedding: matchScore.embeddingScore,
          rules: matchScore.ruleScores,
          breakdown: matchScore.reasons,
        },
      };

      if (existingMatch) {
        await prisma.match.update({
          where: { id: existingMatch.id },
          data: matchData,
        });
      } else {
        await prisma.match.create({
          data: {
            cargoId: matchScore.cargoId,
            vesselId: matchScore.vesselId,
            ...matchData,
          },
        });
      }
    } catch (error) {
      logger.error('Error saving match:', error);
    }
  }
}