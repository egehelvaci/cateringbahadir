import { prisma } from '../config/database';
import { AIService } from './ai.service';
import { logger } from '../utils/logger';
import { Vessel, Cargo, GearType } from '@prisma/client';

interface MatchScore {
  vesselId: bigint;
  cargoId: bigint;
  score: number;
  reasons: string[];
}

export class MatchingService {
  private aiService: AIService;

  constructor() {
    this.aiService = new AIService();
  }

  async findTopMatchesForCargo(cargoId: bigint, limit: number = 3): Promise<MatchScore[]> {
    try {
      const cargo = await prisma.cargo.findUnique({
        where: { id: cargoId },
        include: {
          loadPort: true,
          dischargePort: true,
        },
      });

      if (!cargo) {
        throw new Error('Cargo not found');
      }

      const vessels = await prisma.vessel.findMany({
        where: {
          availableFrom: {
            lte: cargo.laycanEnd || undefined,
          },
        },
      });

      const scores: MatchScore[] = [];

      for (const vessel of vessels) {
        const score = await this.calculateMatchScore(vessel, cargo);
        scores.push(score);
      }

      return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      logger.error('Error finding matches for cargo:', error);
      return [];
    }
  }

  async findTopMatchesForVessel(vesselId: bigint, limit: number = 3): Promise<MatchScore[]> {
    try {
      const vessel = await prisma.vessel.findUnique({
        where: { id: vesselId },
      });

      if (!vessel) {
        throw new Error('Vessel not found');
      }

      const cargos = await prisma.cargo.findMany({
        where: {
          laycanStart: {
            gte: vessel.availableFrom || undefined,
          },
        },
        include: {
          loadPort: true,
          dischargePort: true,
        },
      });

      const scores: MatchScore[] = [];

      for (const cargo of cargos) {
        const score = await this.calculateMatchScore(vessel, cargo);
        scores.push(score);
      }

      return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      logger.error('Error finding matches for vessel:', error);
      return [];
    }
  }

  private async calculateMatchScore(vessel: Vessel, cargo: any): Promise<MatchScore> {
    const reasons: string[] = [];
    let score = 0;

    if (vessel.dwt && cargo.qtyValue) {
      const utilizationRate = cargo.qtyValue / vessel.dwt;
      if (utilizationRate >= 0.7 && utilizationRate <= 1.0) {
        score += 30;
        reasons.push(`Good cargo utilization (${(utilizationRate * 100).toFixed(0)}%)`);
      } else if (utilizationRate >= 0.5 && utilizationRate < 0.7) {
        score += 15;
        reasons.push(`Moderate cargo utilization (${(utilizationRate * 100).toFixed(0)}%)`);
      } else if (utilizationRate > 1.0) {
        score -= 50;
        reasons.push('Cargo exceeds vessel capacity');
      }
    }

    if (vessel.availableFrom && cargo.laycanStart && cargo.laycanEnd) {
      const vesselAvailable = new Date(vessel.availableFrom);
      const laycanStart = new Date(cargo.laycanStart);
      const laycanEnd = new Date(cargo.laycanEnd);

      if (vesselAvailable >= laycanStart && vesselAvailable <= laycanEnd) {
        score += 25;
        reasons.push('Perfect laycan match');
      } else if (vesselAvailable < laycanStart) {
        const daysDiff = Math.floor((laycanStart.getTime() - vesselAvailable.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 7) {
          score += 15;
          reasons.push(`Vessel available ${daysDiff} days before laycan`);
        } else {
          score -= 10;
          reasons.push(`Long wait time (${daysDiff} days)`);
        }
      } else {
        score -= 30;
        reasons.push('Vessel available after laycan');
      }
    }

    const constraints = cargo.constraints as any;
    if (constraints?.minGear && vessel.gear === GearType.gearless) {
      score -= 40;
      reasons.push('Cargo requires geared vessel');
    } else if (vessel.gear === GearType.geared && constraints?.minGear) {
      score += 15;
      reasons.push('Geared vessel matches requirement');
    }

    if (vessel.currentArea && cargo.loadPort) {
      const areaMatch = await this.checkAreaProximity(vessel.currentArea, cargo.loadPort.name);
      if (areaMatch) {
        score += 20;
        reasons.push('Vessel in loading area');
      }
    }

    const commodityScore = await this.calculateCommodityCompatibility(
      vessel,
      cargo.commodity
    );
    score += commodityScore;
    if (commodityScore > 0) {
      reasons.push('Compatible commodity type');
    }

    score = Math.max(0, Math.min(100, score));

    return {
      vesselId: vessel.id,
      cargoId: cargo.id,
      score,
      reasons,
    };
  }

  private async checkAreaProximity(vesselArea: string, portName: string): Promise<boolean> {
    const areaKeywords = vesselArea.toLowerCase().split(/[\s,]+/);
    const portKeywords = portName.toLowerCase().split(/[\s,]+/);
    
    return areaKeywords.some(keyword => 
      portKeywords.some(portKeyword => 
        keyword.includes(portKeyword) || portKeyword.includes(keyword)
      )
    );
  }

  private async calculateCommodityCompatibility(
    vessel: Vessel,
    commodity: string
  ): Promise<number> {
    const bulkCommodities = ['grain', 'coal', 'ore', 'bauxite', 'fertilizer', 'cement'];
    const containerCommodities = ['container', 'teu', 'feu'];
    const tankerCommodities = ['oil', 'crude', 'petroleum', 'chemical', 'lng', 'lpg'];

    const commodityLower = commodity.toLowerCase();

    if (bulkCommodities.some(c => commodityLower.includes(c))) {
      if (!vessel.capacityJson || (vessel.capacityJson as any).grain) {
        return 10;
      }
    }

    if (containerCommodities.some(c => commodityLower.includes(c))) {
      if (vessel.name?.toLowerCase().includes('container')) {
        return 10;
      }
      return -20;
    }

    if (tankerCommodities.some(c => commodityLower.includes(c))) {
      if (vessel.name?.toLowerCase().includes('tanker')) {
        return 10;
      }
      return -30;
    }

    return 5;
  }

  async createMatch(vesselId: bigint, cargoId: bigint): Promise<void> {
    try {
      const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
      const cargo = await prisma.cargo.findUnique({
        where: { id: cargoId },
        include: { loadPort: true, dischargePort: true },
      });

      if (!vessel || !cargo) {
        throw new Error('Vessel or cargo not found');
      }

      const matchScore = await this.calculateMatchScore(vessel, cargo);
      
      const reasonText = await this.aiService.generateMatchReason(
        vessel,
        cargo,
        matchScore.score
      );

      await prisma.match.upsert({
        where: {
          cargoId_vesselId: {
            cargoId,
            vesselId,
          },
        },
        update: {
          score: matchScore.score,
          reason: { 
            text: reasonText,
            details: matchScore.reasons,
          },
        },
        create: {
          cargoId,
          vesselId,
          score: matchScore.score,
          reason: {
            text: reasonText,
            details: matchScore.reasons,
          },
        },
      });

      logger.info(`Match created: Vessel ${vesselId} - Cargo ${cargoId} (Score: ${matchScore.score})`);
    } catch (error) {
      logger.error('Error creating match:', error);
      throw error;
    }
  }
}