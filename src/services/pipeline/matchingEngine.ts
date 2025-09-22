// import { logger } from '../../utils/logger';

interface Cargo {
  id: string;
  cargo_type?: string;
  quantity_ton?: number;
  load_ports?: string[];
  discharge_ports?: string[];
  laycan_start?: Date;
  laycan_end?: Date;
  requirements?: any;
}

interface Vessel {
  id: string;
  vessel_name?: string;
  dwt?: number;
  draft?: number;
  next_open?: Date;
  current_position?: string;
  geared?: boolean;
  crane_capacity?: string;
  vessel_type?: string;
}

interface MatchScore {
  cargo_id: string;
  vessel_id: string;
  total_score: number;
  breakdown: {
    date_overlap: number;
    capacity_utilization: number;
    route_compatibility: number;
    gear_compatibility: number;
    special_requirements: number;
  };
  reasons: string[];
  constraints_passed: boolean;
  blocked_reasons?: string[];
}

export class CargoVesselMatchingEngine {
  private readonly SCORE_WEIGHTS = {
    date_overlap: 0.35,
    capacity_utilization: 0.25,
    route_compatibility: 0.20,
    gear_compatibility: 0.10,
    special_requirements: 0.10
  };

  private readonly CAPACITY_UTILIZATION_THRESHOLDS = {
    min: 0.70, // Minimum 70% utilization
    max: 1.05, // Maximum 105% (with tolerance)
    optimal: 0.90 // Optimal 90% utilization
  };

  private portDistances: Map<string, Map<string, number>> = new Map();

  constructor() {
    this.initializePortDistances();
  }

  /**
   * Initialize port distances (simplified - in production use actual distance API)
   */
  private initializePortDistances() {
    this.portDistances = new Map();
    
    // Simplified distance matrix (nautical miles)
    const distances: Record<string, Record<string, number>> = {
      'singapore': { 'rotterdam': 8450, 'shanghai': 2400, 'houston': 9600 },
      'rotterdam': { 'singapore': 8450, 'shanghai': 10800, 'houston': 4900 },
      'shanghai': { 'singapore': 2400, 'rotterdam': 10800, 'houston': 11000 },
      'houston': { 'singapore': 9600, 'rotterdam': 4900, 'shanghai': 11000 }
    };
    
    Object.entries(distances).forEach(([port1, destinations]) => {
      const portMap = new Map<string, number>();
      Object.entries(destinations).forEach(([port2, distance]) => {
        portMap.set(port2.toLowerCase(), distance);
      });
      this.portDistances.set(port1.toLowerCase(), portMap);
    });
  }

  /**
   * Main matching function
   */
  public matchCargoToVessels(cargo: Cargo, vessels: Vessel[]): MatchScore[] {
    const matches: MatchScore[] = [];
    
    for (const vessel of vessels) {
      const score = this.calculateMatchScore(cargo, vessel);
      if (score.constraints_passed) {
        matches.push(score);
      }
    }
    
    // Sort by total score descending
    matches.sort((a, b) => b.total_score - a.total_score);
    
    return matches;
  }

  /**
   * Calculate match score between cargo and vessel
   */
  private calculateMatchScore(cargo: Cargo, vessel: Vessel): MatchScore {
    const score: MatchScore = {
      cargo_id: cargo.id,
      vessel_id: vessel.id,
      total_score: 0,
      breakdown: {
        date_overlap: 0,
        capacity_utilization: 0,
        route_compatibility: 0,
        gear_compatibility: 0,
        special_requirements: 0
      },
      reasons: [],
      constraints_passed: true,
      blocked_reasons: []
    };
    
    // Check hard constraints first
    const constraintsResult = this.checkHardConstraints(cargo, vessel);
    if (!constraintsResult.passed) {
      score.constraints_passed = false;
      score.blocked_reasons = constraintsResult.reasons;
      return score;
    }
    
    // Calculate individual scores
    score.breakdown.date_overlap = this.calculateDateOverlapScore(cargo, vessel);
    score.breakdown.capacity_utilization = this.calculateCapacityUtilizationScore(cargo, vessel);
    score.breakdown.route_compatibility = this.calculateRouteCompatibilityScore(cargo, vessel);
    score.breakdown.gear_compatibility = this.calculateGearCompatibilityScore(cargo, vessel);
    score.breakdown.special_requirements = this.calculateSpecialRequirementsScore(cargo, vessel);
    
    // Calculate weighted total
    score.total_score = 
      score.breakdown.date_overlap * this.SCORE_WEIGHTS.date_overlap +
      score.breakdown.capacity_utilization * this.SCORE_WEIGHTS.capacity_utilization +
      score.breakdown.route_compatibility * this.SCORE_WEIGHTS.route_compatibility +
      score.breakdown.gear_compatibility * this.SCORE_WEIGHTS.gear_compatibility +
      score.breakdown.special_requirements * this.SCORE_WEIGHTS.special_requirements;
    
    // Generate reasons
    score.reasons = this.generateMatchReasons(score.breakdown);
    
    return score;
  }

  /**
   * Check hard constraints
   */
  private checkHardConstraints(cargo: Cargo, vessel: Vessel): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    // Check capacity constraint
    if (cargo.quantity_ton && vessel.dwt) {
      if (cargo.quantity_ton > vessel.dwt * 1.05) {
        reasons.push(`Cargo quantity (${cargo.quantity_ton} MT) exceeds vessel capacity (${vessel.dwt} DWT)`);
      }
      if (cargo.quantity_ton < vessel.dwt * 0.5) {
        reasons.push(`Cargo quantity too small for vessel size (${cargo.quantity_ton} MT vs ${vessel.dwt} DWT)`);
      }
    }
    
    // Check date constraints
    if (cargo.laycan_end && vessel.next_open) {
      const daysDiff = this.daysBetween(vessel.next_open, cargo.laycan_end);
      if (daysDiff > 30) {
        reasons.push(`Vessel availability too late (${daysDiff} days after laycan end)`);
      }
    }
    
    // Check special requirements
    if (cargo.requirements?.geared_required && vessel.geared === false) {
      reasons.push('Cargo requires geared vessel but vessel is gearless');
    }
    
    return {
      passed: reasons.length === 0,
      reasons
    };
  }

  /**
   * Calculate date overlap score
   */
  private calculateDateOverlapScore(cargo: Cargo, vessel: Vessel): number {
    if (!cargo.laycan_start || !cargo.laycan_end || !vessel.next_open) {
      return 0.5; // Neutral score if dates missing
    }
    
    const vesselAvailable = vessel.next_open;
    const laycanStart = cargo.laycan_start;
    const laycanEnd = cargo.laycan_end;
    
    // Check if vessel available within laycan
    if (vesselAvailable >= laycanStart && vesselAvailable <= laycanEnd) {
      return 1.0; // Perfect match
    }
    
    // Calculate days difference
    const daysBefore = this.daysBetween(vesselAvailable, laycanStart);
    const daysAfter = this.daysBetween(laycanEnd, vesselAvailable);
    
    if (daysBefore > 0 && daysBefore <= 7) {
      return 0.9 - (daysBefore * 0.05); // Small penalty for early arrival
    } else if (daysAfter > 0 && daysAfter <= 7) {
      return 0.8 - (daysAfter * 0.1); // Larger penalty for late arrival
    }
    
    return Math.max(0, 0.5 - Math.min(daysBefore, daysAfter) * 0.05);
  }

  /**
   * Calculate capacity utilization score
   */
  private calculateCapacityUtilizationScore(cargo: Cargo, vessel: Vessel): number {
    if (!cargo.quantity_ton || !vessel.dwt) {
      return 0.5; // Neutral score if data missing
    }
    
    const utilization = cargo.quantity_ton / vessel.dwt;
    
    // Check against thresholds
    if (utilization < this.CAPACITY_UTILIZATION_THRESHOLDS.min) {
      return utilization / this.CAPACITY_UTILIZATION_THRESHOLDS.min * 0.7;
    } else if (utilization > this.CAPACITY_UTILIZATION_THRESHOLDS.max) {
      return Math.max(0, 1 - (utilization - this.CAPACITY_UTILIZATION_THRESHOLDS.max) * 2);
    } else if (Math.abs(utilization - this.CAPACITY_UTILIZATION_THRESHOLDS.optimal) < 0.05) {
      return 1.0; // Perfect utilization
    } else {
      // Linear interpolation between min and optimal
      return 0.7 + (utilization - this.CAPACITY_UTILIZATION_THRESHOLDS.min) * 
             (0.3 / (this.CAPACITY_UTILIZATION_THRESHOLDS.optimal - this.CAPACITY_UTILIZATION_THRESHOLDS.min));
    }
  }

  /**
   * Calculate route compatibility score
   */
  private calculateRouteCompatibilityScore(cargo: Cargo, vessel: Vessel): number {
    if (!cargo.load_ports?.length || !cargo.discharge_ports?.length || !vessel.current_position) {
      return 0.5; // Neutral score if data missing
    }
    
    // Calculate distance from vessel position to load port
    const loadPort = cargo.load_ports[0].toLowerCase();
    const currentPos = vessel.current_position.toLowerCase();
    const distance = this.getPortDistance(currentPos, loadPort);
    
    if (distance === undefined) {
      return 0.5; // Unknown route
    }
    
    // Score based on distance (simplified)
    if (distance < 500) {
      return 1.0; // Very close
    } else if (distance < 2000) {
      return 0.9;
    } else if (distance < 5000) {
      return 0.7;
    } else if (distance < 10000) {
      return 0.5;
    } else {
      return 0.3; // Very far
    }
  }

  /**
   * Calculate gear compatibility score
   */
  private calculateGearCompatibilityScore(cargo: Cargo, vessel: Vessel): number {
    // Check if cargo requires special gear
    const requiresGear = cargo.requirements?.geared_required || 
                        cargo.cargo_type?.includes('project') ||
                        cargo.cargo_type?.includes('heavy');
    
    if (!requiresGear) {
      return 1.0; // No special gear required
    }
    
    if (vessel.geared === true) {
      // Check crane capacity if specified
      if (cargo.requirements?.min_crane_capacity && vessel.crane_capacity) {
        const required = parseFloat(cargo.requirements.min_crane_capacity);
        const available = parseFloat(vessel.crane_capacity.split('x')[1] || '0');
        
        if (available >= required) {
          return 1.0;
        } else {
          return available / required * 0.8;
        }
      }
      return 0.9; // Geared but capacity unknown
    }
    
    return 0.2; // Requires gear but vessel is gearless
  }

  /**
   * Calculate special requirements score
   */
  private calculateSpecialRequirementsScore(cargo: Cargo, vessel: Vessel): number {
    if (!cargo.requirements) {
      return 1.0; // No special requirements
    }
    
    let score = 1.0;
    let requirementCount = 0;
    let metCount = 0;
    
    // Check vessel type compatibility
    if (cargo.requirements.vessel_type) {
      requirementCount++;
      if (vessel.vessel_type?.includes(cargo.requirements.vessel_type)) {
        metCount++;
      }
    }
    
    // Check ice class requirement
    if (cargo.requirements.ice_class_required) {
      requirementCount++;
      // Vessel ice class check would go here
      metCount += 0.5; // Assume partial match for now
    }
    
    // Check solo cargo requirement
    if (cargo.requirements.solo_cargo) {
      requirementCount++;
      metCount++; // Assume can be met
    }
    
    if (requirementCount > 0) {
      score = metCount / requirementCount;
    }
    
    return score;
  }

  /**
   * Generate human-readable match reasons
   */
  private generateMatchReasons(breakdown: MatchScore['breakdown']): string[] {
    const reasons: string[] = [];
    
    if (breakdown.date_overlap > 0.9) {
      reasons.push('Excellent date alignment with laycan window');
    } else if (breakdown.date_overlap > 0.7) {
      reasons.push('Good date compatibility');
    }
    
    if (breakdown.capacity_utilization > 0.85) {
      reasons.push('Optimal capacity utilization');
    } else if (breakdown.capacity_utilization > 0.7) {
      reasons.push('Acceptable capacity utilization');
    }
    
    if (breakdown.route_compatibility > 0.8) {
      reasons.push('Vessel well-positioned for the route');
    }
    
    if (breakdown.gear_compatibility === 1.0) {
      reasons.push('All equipment requirements met');
    }
    
    if (breakdown.special_requirements > 0.9) {
      reasons.push('Special requirements satisfied');
    }
    
    return reasons;
  }

  /**
   * Utility functions
   */
  private daysBetween(date1: Date, date2: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
  }

  private getPortDistance(port1: string, port2: string): number | undefined {
    const p1Map = this.portDistances.get(port1);
    if (p1Map) {
      return p1Map.get(port2);
    }
    // Try reverse lookup
    const p2Map = this.portDistances.get(port2);
    if (p2Map) {
      return p2Map.get(port1);
    }
    return undefined;
  }

  /**
   * Batch matching for multiple cargos and vessels
   */
  public findBestMatches(cargos: Cargo[], vessels: Vessel[], topN: number = 5): Map<string, MatchScore[]> {
    const results = new Map<string, MatchScore[]>();
    
    for (const cargo of cargos) {
      const matches = this.matchCargoToVessels(cargo, vessels);
      results.set(cargo.id, matches.slice(0, topN));
    }
    
    return results;
  }
}