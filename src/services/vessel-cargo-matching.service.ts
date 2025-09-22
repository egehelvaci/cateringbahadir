import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface MatchCriteria {
  maxLaycanGapDays?: number;     // Varsayılan: 3
  maxDistanceDays?: number;      // Varsayılan: 2
  maxOversizeRatio?: number;     // Varsayılan: 0.35
  routeFactor?: number;          // Varsayılan: 1.20
  minMatchScore?: number;        // Varsayılan: 60
}

export interface MatchDetails {
  tonnageMatch: boolean;
  laycanMatch: boolean;
  distanceMatch: boolean;
  cubicMatch: boolean;
  requirementsMatch: boolean;
  sailingDays?: number;
  laycanGapDays?: number;
  tonnageUtilization?: number;   // Yük/DWT oranı %
  cubicUtilization?: number;     // Gerekli hacim/Mevcut hacim %
}

export interface VesselCargoMatchResult {
  vesselId: number;
  cargoId: number;
  vessel: any;
  cargo: any;
  matchScore: number;
  matchDetails: MatchDetails;
  reason: string;
}

export interface PortCoordinate {
  name: string;
  latitude: number;
  longitude: number;
}

export class VesselCargoMatchingService {
  private defaultCriteria: MatchCriteria = {
    maxLaycanGapDays: 3,
    maxDistanceDays: 2,
    maxOversizeRatio: 0.35,
    routeFactor: 1.20,
    minMatchScore: 60
  };

  // Liman koordinatları - veritabanından alınacak, fallback olarak hardcoded
  private defaultPorts: Record<string, PortCoordinate> = {
    'gemlik': { name: 'Gemlik', latitude: 40.43, longitude: 29.15 },
    'eleusis': { name: 'Eleusis', latitude: 38.04, longitude: 23.54 },
    'odessa': { name: 'Odessa', latitude: 46.49, longitude: 30.73 },
    'batumi': { name: 'Batumi', latitude: 41.65, longitude: 41.65 },
    'constanta': { name: 'Constanta', latitude: 44.17, longitude: 28.65 },
    'izmir': { name: 'Izmir', latitude: 38.44, longitude: 27.15 },
    'chornomorsk': { name: 'Chornomorsk', latitude: 46.30, longitude: 30.66 },
    'alexandria': { name: 'Alexandria', latitude: 31.20, longitude: 29.92 },
    'casablanca': { name: 'Casablanca', latitude: 33.60, longitude: -7.62 },
    'novorossiysk': { name: 'Novorossiysk', latitude: 44.72, longitude: 37.77 }
  };

  /**
   * Gemi-yük eşleştirmesi yapar
   */
  async findMatches(
    vesselIds?: number[], 
    cargoIds?: number[], 
    criteria: MatchCriteria = {}
  ): Promise<VesselCargoMatchResult[]> {
    const finalCriteria = { ...this.defaultCriteria, ...criteria };
    const matches: VesselCargoMatchResult[] = [];

    try {
      // Gemileri getir
      const vessels = await prisma.vessel.findMany({
        where: {
          id: vesselIds ? { in: vesselIds } : undefined,
          status: 'AVAILABLE'
        }
      });

      // Yükleri getir
      const cargos = await prisma.cargo.findMany({
        where: {
          id: cargoIds ? { in: cargoIds } : undefined,
          status: 'AVAILABLE'
        }
      });

      logger.info(`Eşleştirme başlatılıyor: ${vessels.length} gemi, ${cargos.length} yük`);

      // Her gemi-yük çifti için eşleştirme kontrolü
      for (const vessel of vessels) {
        for (const cargo of cargos) {
          const matchResult = await this.evaluateMatch(vessel, cargo, finalCriteria);
          if (matchResult && matchResult.matchScore >= finalCriteria.minMatchScore!) {
            matches.push(matchResult);
          }
        }
      }

      // Sonuçları skora göre sırala
      matches.sort((a, b) => b.matchScore - a.matchScore);

      logger.info(`${matches.length} uygun eşleşme bulundu`);
      return matches;

    } catch (error) {
      logger.error('Eşleştirme hatası:', error);
      throw error;
    }
  }

  /**
   * Tek gemi-yük çiftini değerlendirir
   */
  private async evaluateMatch(
    vessel: any, 
    cargo: any, 
    criteria: MatchCriteria
  ): Promise<VesselCargoMatchResult | null> {
    const matchDetails: MatchDetails = {
      tonnageMatch: false,
      laycanMatch: false,
      distanceMatch: false,
      cubicMatch: false,
      requirementsMatch: false
    };

    let score = 0;
    const reasons: string[] = [];

    // 1. Tonaj Kontrolü
    const tonnageResult = this.checkTonnage(vessel, cargo, criteria.maxOversizeRatio!);
    matchDetails.tonnageMatch = tonnageResult.match;
    matchDetails.tonnageUtilization = tonnageResult.utilization;
    
    if (tonnageResult.match) {
      score += 25;
      reasons.push(`Tonaj uyumu: ${tonnageResult.utilization.toFixed(1)}%`);
    } else {
      return null; // Tonaj uymazsa eşleştirme iptal
    }

    // 2. Laycan Kontrolü
    const laycanResult = this.checkLaycan(vessel, cargo, criteria.maxLaycanGapDays!);
    matchDetails.laycanMatch = laycanResult.match;
    matchDetails.laycanGapDays = laycanResult.gapDays;
    
    if (laycanResult.match) {
      score += 25;
      reasons.push(`Laycan uyumu: ${laycanResult.gapDays} gün fark`);
    } else {
      return null; // Laycan uymazsa eşleştirme iptal
    }

    // 3. Mesafe Kontrolü
    const distanceResult = await this.checkDistance(vessel, cargo, criteria.maxDistanceDays!, criteria.routeFactor!);
    matchDetails.distanceMatch = distanceResult.match;
    matchDetails.sailingDays = distanceResult.sailingDays;
    
    if (distanceResult.match) {
      score += 20;
      reasons.push(`Mesafe uyumu: ${distanceResult.sailingDays?.toFixed(1)} gün seyir`);
    } else {
      return null; // Mesafe uymazsa eşleştirme iptal
    }

    // 4. Küp Kontrolü
    const cubicResult = this.checkCubic(vessel, cargo);
    matchDetails.cubicMatch = cubicResult.match;
    matchDetails.cubicUtilization = cubicResult.utilization;
    
    if (cubicResult.match) {
      score += 15;
      if (cubicResult.utilization) {
        reasons.push(`Küp uyumu: ${cubicResult.utilization.toFixed(1)}% doluluk`);
      } else {
        reasons.push('Küp uyumu: SF belirtilmemiş');
      }
    } else if (cargo.stowageFactorValue) {
      score -= 10; // SF var ama küp uymuyor
      reasons.push('Küp uyumsuzluğu');
    }

    // 5. Özel Gereksinimler
    const requirementsResult = this.checkRequirements(vessel, cargo);
    matchDetails.requirementsMatch = requirementsResult.match;
    
    if (requirementsResult.match) {
      score += 15;
      if (requirementsResult.matchedRequirements.length > 0) {
        reasons.push(`Gereksinimler: ${requirementsResult.matchedRequirements.join(', ')}`);
      }
    } else {
      return null; // Gereksinimler uymazsa eşleştirme iptal
    }

    // Bonus puanlar
    if (matchDetails.tonnageUtilization && matchDetails.tonnageUtilization > 85) {
      score += 5; // Yüksek tonaj kullanımı bonusu
    }
    
    if (matchDetails.laycanGapDays === 0) {
      score += 5; // Tam laycan uyumu bonusu
    }

    return {
      vesselId: vessel.id,
      cargoId: cargo.id,
      vessel,
      cargo,
      matchScore: Math.min(score, 100), // Max 100 puan
      matchDetails,
      reason: reasons.join('; ')
    };
  }

  /**
   * Tonaj uyumluluğunu kontrol eder
   */
  private checkTonnage(vessel: any, cargo: any, maxOversizeRatio: number): {
    match: boolean;
    utilization: number;
  } {
    if (!vessel.dwt || !cargo.quantity) {
      return { match: false, utilization: 0 };
    }

    const utilization = (cargo.quantity / vessel.dwt) * 100;
    const minUtilization = (1 - maxOversizeRatio) * 100; // %65 varsayılan

    const match = cargo.quantity <= vessel.dwt && utilization >= minUtilization;
    
    return { match, utilization };
  }

  /**
   * Laycan uyumluluğunu kontrol eder
   */
  private checkLaycan(vessel: any, cargo: any, maxGapDays: number): {
    match: boolean;
    gapDays: number;
  } {
    if (!vessel.laycanStart || !vessel.laycanEnd || !cargo.laycanStart || !cargo.laycanEnd) {
      return { match: false, gapDays: Infinity };
    }

    const gapDays = this.daysBetween(
      vessel.laycanStart, vessel.laycanEnd,
      cargo.laycanStart, cargo.laycanEnd
    );

    return {
      match: gapDays <= maxGapDays,
      gapDays
    };
  }

  /**
   * İki tarih aralığı arasındaki gün farkını hesaplar
   */
  private daysBetween(
    aStart: Date, aEnd: Date, 
    bStart: Date, bEnd: Date
  ): number {
    // Aralıklar çakışıyorsa 0
    if (aEnd >= bStart && bEnd >= aStart) {
      return 0;
    }
    
    // En küçük farkı hesapla
    if (aEnd < bStart) {
      return Math.ceil((bStart.getTime() - aEnd.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    if (bEnd < aStart) {
      return Math.ceil((aStart.getTime() - bEnd.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    return 0;
  }

  /**
   * Mesafe uyumluluğunu kontrol eder
   */
  private async checkDistance(
    vessel: any, 
    cargo: any, 
    maxDays: number, 
    routeFactor: number
  ): Promise<{
    match: boolean;
    sailingDays?: number;
  }> {
    if (!vessel.currentPort || !cargo.loadPort) {
      return { match: false };
    }

    try {
      const distance = await this.calculateDistance(vessel.currentPort, cargo.loadPort);
      if (distance === null) {
        return { match: false }; // Liman bulunamazsa uyumsuz
      }

      const speed = vessel.speedKnots || 12.0;
      const sailingDays = (distance * routeFactor) / (speed * 24); // hours to days

      return {
        match: sailingDays <= maxDays,
        sailingDays
      };

    } catch (error) {
      logger.error('Mesafe hesaplama hatası:', error);
      return { match: false };
    }
  }

  /**
   * İki liman arasındaki mesafeyi hesaplar (nautical miles)
   */
  private async calculateDistance(port1: string, port2: string): Promise<number | null> {
    try {
      // Önce veritabanından port koordinatlarını al
      const ports = await prisma.port.findMany({
        where: {
          OR: [
            { name: { contains: port1, mode: 'insensitive' } },
            { name: { contains: port2, mode: 'insensitive' } },
            { alternateNames: { path: '$[*]', string_contains: port1 } },
            { alternateNames: { path: '$[*]', string_contains: port2 } }
          ]
        }
      });

      let coord1: PortCoordinate | null = null;
      let coord2: PortCoordinate | null = null;

      // Veritabanından bulunan koordinatları eşle
      for (const port of ports) {
        const portNames = [port.name, ...(port.alternateNames as string[] || [])];
        const matchesPort1 = portNames.some(name => 
          name.toLowerCase().includes(port1.toLowerCase()) || 
          port1.toLowerCase().includes(name.toLowerCase())
        );
        const matchesPort2 = portNames.some(name => 
          name.toLowerCase().includes(port2.toLowerCase()) || 
          port2.toLowerCase().includes(name.toLowerCase())
        );

        if (matchesPort1 && !coord1) {
          coord1 = { name: port.name, latitude: port.latitude, longitude: port.longitude };
        }
        if (matchesPort2 && !coord2) {
          coord2 = { name: port.name, latitude: port.latitude, longitude: port.longitude };
        }
      }

      // Veritabanında bulunamazsa fallback koordinatları kullan
      if (!coord1) {
        const fallbackKey = Object.keys(this.defaultPorts).find(key => 
          key.toLowerCase().includes(port1.toLowerCase()) || 
          port1.toLowerCase().includes(key)
        );
        if (fallbackKey) {
          coord1 = this.defaultPorts[fallbackKey];
        }
      }

      if (!coord2) {
        const fallbackKey = Object.keys(this.defaultPorts).find(key => 
          key.toLowerCase().includes(port2.toLowerCase()) || 
          port2.toLowerCase().includes(key)
        );
        if (fallbackKey) {
          coord2 = this.defaultPorts[fallbackKey];
        }
      }

      if (!coord1 || !coord2) {
        logger.warn(`Liman koordinatları bulunamadı: ${port1} -> ${port2}`);
        return null;
      }

      return this.haversineDistance(coord1, coord2);

    } catch (error) {
      logger.error('Mesafe hesaplama hatası:', error);
      return null;
    }
  }

  /**
   * Haversine formülü ile büyük çember mesafesi (nautical miles)
   */
  private haversineDistance(coord1: PortCoordinate, coord2: PortCoordinate): number {
    const R_nm = 3440.065; // Dünya yarıçapı (nautical miles)
    const lat1Rad = (coord1.latitude * Math.PI) / 180;
    const lon1Rad = (coord1.longitude * Math.PI) / 180;
    const lat2Rad = (coord2.latitude * Math.PI) / 180;
    const lon2Rad = (coord2.longitude * Math.PI) / 180;

    const dlat = lat2Rad - lat1Rad;
    const dlon = lon2Rad - lon1Rad;

    const a = Math.sin(dlat / 2) ** 2 + 
              Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dlon / 2) ** 2;
    const c = 2 * Math.asin(Math.sqrt(a));

    return R_nm * c;
  }

  /**
   * Küp/hacim uyumluluğunu kontrol eder
   */
  private checkCubic(vessel: any, cargo: any): {
    match: boolean;
    utilization?: number;
  } {
    if (!cargo.stowageFactorValue) {
      return { match: true }; // SF yoksa küp kontrolü atlanır
    }

    const vesselCapacity = vessel.baleCuft || vessel.grainCuft;
    if (!vesselCapacity) {
      return { match: false };
    }

    const neededCuft = this.calculateNeededCuft(cargo);
    if (!neededCuft) {
      return { match: false };
    }

    const utilization = (neededCuft / vesselCapacity) * 100;
    return {
      match: neededCuft <= vesselCapacity,
      utilization
    };
  }

  /**
   * Yük için gerekli hacmi hesaplar (cuft)
   */
  private calculateNeededCuft(cargo: any): number | null {
    if (!cargo.stowageFactorValue || !cargo.quantity) {
      return null;
    }

    let sfCuft = cargo.stowageFactorValue;
    
    // m3/mt ise cuft'a dönüştür
    if (cargo.stowageFactorUnit === 'm3/mt' || cargo.stowageFactorUnit === 'cbm/mt') {
      sfCuft = cargo.stowageFactorValue * 35.3147;
    }

    const brokenStowage = 1 + (cargo.brokenStowagePct / 100);
    return cargo.quantity * sfCuft * brokenStowage;
  }

  /**
   * Özel gereksinimleri kontrol eder
   */
  private checkRequirements(vessel: any, cargo: any): {
    match: boolean;
    matchedRequirements: string[];
    missingRequirements: string[];
  } {
    const cargoRequirements = cargo.requirements as string[] || [];
    const vesselFeatures = vessel.features as string[] || [];
    
    if (cargoRequirements.length === 0) {
      return { match: true, matchedRequirements: [], missingRequirements: [] };
    }

    const matchedRequirements: string[] = [];
    const missingRequirements: string[] = [];

    for (const requirement of cargoRequirements) {
      const requirementLower = requirement.toLowerCase();
      const hasFeature = vesselFeatures.some(feature => 
        feature.toLowerCase().includes(requirementLower) ||
        requirementLower.includes(feature.toLowerCase())
      );

      if (hasFeature) {
        matchedRequirements.push(requirement);
      } else {
        missingRequirements.push(requirement);
      }
    }

    return {
      match: missingRequirements.length === 0,
      matchedRequirements,
      missingRequirements
    };
  }

  /**
   * Eşleştirme sonuçlarını veritabanına kaydeder
   */
  async saveMatches(matches: VesselCargoMatchResult[]): Promise<number[]> {
    const savedMatchIds: number[] = [];

    try {
      for (const match of matches) {
        // Mevcut eşleştirmeyi kontrol et
        const existingMatch = await prisma.vesselCargoMatch.findUnique({
          where: {
            vesselId_cargoId: {
              vesselId: match.vesselId,
              cargoId: match.cargoId
            }
          }
        });

        if (existingMatch) {
          // Güncelle
          const updated = await prisma.vesselCargoMatch.update({
            where: { id: existingMatch.id },
            data: {
              matchScore: match.matchScore,
              matchReasons: match.matchDetails,
              status: 'PROPOSED'
            }
          });
          savedMatchIds.push(updated.id);
        } else {
          // Yeni kayıt oluştur
          const created = await prisma.vesselCargoMatch.create({
            data: {
              vesselId: match.vesselId,
              cargoId: match.cargoId,
              matchScore: match.matchScore,
              matchReasons: match.matchDetails,
              status: 'PROPOSED'
            }
          });
          savedMatchIds.push(created.id);
        }
      }

      logger.info(`${savedMatchIds.length} eşleştirme kaydedildi`);
      return savedMatchIds;

    } catch (error) {
      logger.error('Eşleştirme kaydetme hatası:', error);
      throw error;
    }
  }
}
