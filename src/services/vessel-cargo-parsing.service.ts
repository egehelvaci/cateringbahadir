import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { Document } from 'docx';
import { prisma } from '../config/database';

export interface ParsedVessel {
  name: string;
  dwt?: number;
  grainCuft?: number;
  baleCuft?: number;
  speedKnots?: number;
  features: string[];
  currentPort?: string;
  laycanStart?: Date;
  laycanEnd?: Date;
}

export interface ParsedCargo {
  reference: string;
  loadPort?: string;
  laycanStart?: Date;
  laycanEnd?: Date;
  quantity?: number;
  stowageFactorValue?: number;
  stowageFactorUnit: string;
  brokenStowagePct: number;
  requirements: string[];
}

export interface ParseResult {
  vessels: ParsedVessel[];
  cargos: ParsedCargo[];
  errors: string[];
}

export class VesselCargoParsingService {
  private vesselPatterns = {
    name: [
      /M[\/.]?V\s+([A-Z\s\d]+)(?:\s*\/|\s*,|\s*\n|$)/i,
      /VESSEL[:\s]+([A-Z\s\d]+)(?:\s*\/|\s*,|\s*\n|$)/i,
      /SHIP[:\s]+([A-Z\s\d]+)(?:\s*\/|\s*,|\s*\n|$)/i
    ],
    dwt: [
      /(\d{1,3}(?:[,.]?\d{3})*)\s*(?:MT|DWT|DWCC|DWAT)(?:\s|$)/i,
      /DWT[:\s]+(\d{1,3}(?:[,.]?\d{3})*)/i,
      /DEADWEIGHT[:\s]+(\d{1,3}(?:[,.]?\d{3})*)/i
    ],
    openPort: [
      /OPEN[:\s]+([A-Z\s]+)(?:\s*\/|\s*,|\s*\n|\s*\d)/i,
      /POSITION[:\s]+([A-Z\s]+)(?:\s*\/|\s*,|\s*\n|\s*\d)/i,
      /CURRENT[:\s]+([A-Z\s]+)(?:\s*\/|\s*,|\s*\n|\s*\d)/i
    ],
    laycan: [
      /LAYCAN[:\s]+(\d{1,2}[-\/]\d{1,2})\s*[-\/]\s*(\d{1,2}[-\/]\d{1,2})/i,
      /(\d{1,2}[-\/]\d{1,2})\s*[-\/]\s*(\d{1,2}[-\/]\d{1,2})\s*(?:LAYCAN|LAY)/i
    ],
    grain: [
      /GRAIN[:\s]+(\d{1,3}(?:[,.]?\d{3})*)\s*(?:CUFT|CBM|M3)/i,
      /(\d{1,3}(?:[,.]?\d{3})*)\s*CUFT\s*GRAIN/i
    ],
    bale: [
      /BALE[:\s]+(\d{1,3}(?:[,.]?\d{3})*)\s*(?:CUFT|CBM|M3)/i,
      /(\d{1,3}(?:[,.]?\d{3})*)\s*CUFT\s*BALE/i
    ],
    speed: [
      /(\d{1,2}(?:\.\d)?)\s*(?:KTS|KNOTS|KN)/i,
      /SPEED[:\s]+(\d{1,2}(?:\.\d)?)/i
    ],
    features: [
      /\b(GEARED|GEAR)\b/i,
      /\b(BOX\s*HOLD?|BOX)\b/i,
      /\b(OPEN\s*HATCH)\b/i,
      /\b(HEAVY\s*GEAR)\b/i,
      /\b(SELF\s*DISCHARGING)\b/i,
      /\b(GRAB\s*FITTED)\b/i
    ]
  };

  private cargoPatterns = {
    quantity: [
      /(\d{1,3}(?:[,.]?\d{3})*)\s*(?:MT|MTONS?|METRIC\s*TONS?)\s+([A-Z]+)/i,
      /(\d{1,3}(?:[,.]?\d{3})*)\s*(?:MT|MTONS?)\s*(?:OF\s*)?([A-Z\s]+)/i
    ],
    loadPort: [
      /(?:EX|FROM|LOAD(?:ING)?)[:\s]+([A-Z\s]+)(?:\s*\/|\s*TO|\s*\n|$)/i,
      /(?:CARGO\s*)?(?:EX|FROM)[:\s]+([A-Z\s]+)/i
    ],
    laycan: [
      /LAYCAN[:\s]+(\d{1,2}[-\/]\d{1,2})\s*[-\/]\s*(\d{1,2}[-\/]\d{1,2})/i,
      /(\d{1,2}[-\/]\d{1,2})\s*[-\/]\s*(\d{1,2}[-\/]\d{1,2})\s*(?:LAYCAN|LAY)/i
    ],
    stowageFactor: [
      /SF[:\s]+(\d+(?:\.\d+)?)\s*(CUFT\/MT|M3\/MT|CBM\/MT)/i,
      /STOWAGE[:\s]+(\d+(?:\.\d+)?)\s*(CUFT\/MT|M3\/MT|CBM\/MT)/i
    ],
    brokenStowage: [
      /BROKEN\s*STOWAGE[:\s]+(\d+(?:\.\d+)?)%?/i,
      /BS[:\s]+(\d+(?:\.\d+)?)%?/i
    ],
    requirements: [
      /\b(BOX\s*HOLD?|BOX)\b/i,
      /\b(OPEN\s*HATCH)\b/i,
      /\b(GEARED|GEAR)\b/i,
      /\b(HEAVY\s*GEAR)\b/i,
      /\b(SELF\s*DISCHARGING)\b/i
    ]
  };

  /**
   * Mail dosyasını parse ederek gemi ve yük bilgilerini çıkarır
   */
  async parseMailFile(filePath: string): Promise<ParseResult> {
    try {
      logger.info(`Parsing mail file: ${filePath}`);
      
      let content: string;
      const extension = path.extname(filePath).toLowerCase();

      if (extension === '.txt') {
        content = fs.readFileSync(filePath, 'utf8');
      } else if (extension === '.docx') {
        // DOCX parsing için docx kütüphanesini kullan
        const buffer = fs.readFileSync(filePath);
        content = await this.extractTextFromDocx(buffer);
      } else {
        throw new Error(`Desteklenmeyen dosya formatı: ${extension}`);
      }

      return this.parseMailContent(content);

    } catch (error) {
      logger.error('Mail dosyası parse edilirken hata:', error);
      throw error;
    }
  }

  /**
   * Mail içeriğini parse eder
   */
  private parseMailContent(content: string): ParseResult {
    const result: ParseResult = {
      vessels: [],
      cargos: [],
      errors: []
    };

    try {
      // E-postaları ayır (From:, Subject: gibi başlıklarla)
      const emails = this.splitEmails(content);
      
      for (const email of emails) {
        const vesselInfo = this.extractVesselInfo(email);
        const cargoInfo = this.extractCargoInfo(email);

        if (vesselInfo) {
          result.vessels.push(vesselInfo);
        }

        if (cargoInfo) {
          result.cargos.push(cargoInfo);
        }
      }

      logger.info(`Parse sonucu: ${result.vessels.length} gemi, ${result.cargos.length} yük bulundu`);

    } catch (error) {
      const errorMsg = `Parse işlemi sırasında hata: ${error}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg);
    }

    return result;
  }

  /**
   * E-postaları ayırır
   */
  private splitEmails(content: string): string[] {
    // From:, Subject: veya benzer başlıklarla e-postaları ayır
    const emailSeparators = /(?:From:|Subject:|Date:|To:)/gi;
    const emails = content.split(emailSeparators).filter(email => email.trim().length > 50);
    return emails;
  }

  /**
   * Gemi bilgilerini çıkarır
   */
  private extractVesselInfo(text: string): ParsedVessel | null {
    const vessel: Partial<ParsedVessel> = {
      features: [],
    };

    // Gemi adı
    for (const pattern of this.vesselPatterns.name) {
      const match = text.match(pattern);
      if (match) {
        vessel.name = match[1].trim();
        break;
      }
    }

    if (!vessel.name) return null; // Gemi adı bulunamazsa null döndür

    // DWT
    for (const pattern of this.vesselPatterns.dwt) {
      const match = text.match(pattern);
      if (match) {
        vessel.dwt = this.parseNumber(match[1]);
        break;
      }
    }

    // Açık liman
    for (const pattern of this.vesselPatterns.openPort) {
      const match = text.match(pattern);
      if (match) {
        vessel.currentPort = match[1].trim();
        break;
      }
    }

    // Laycan
    const laycanMatch = text.match(this.vesselPatterns.laycan[0]);
    if (laycanMatch) {
      vessel.laycanStart = this.parseDate(laycanMatch[1]);
      vessel.laycanEnd = this.parseDate(laycanMatch[2]);
    }

    // Grain kapasitesi
    for (const pattern of this.vesselPatterns.grain) {
      const match = text.match(pattern);
      if (match) {
        vessel.grainCuft = this.parseNumber(match[1]);
        break;
      }
    }

    // Bale kapasitesi
    for (const pattern of this.vesselPatterns.bale) {
      const match = text.match(pattern);
      if (match) {
        vessel.baleCuft = this.parseNumber(match[1]);
        break;
      }
    }

    // Hız
    for (const pattern of this.vesselPatterns.speed) {
      const match = text.match(pattern);
      if (match) {
        vessel.speedKnots = parseFloat(match[1]);
        break;
      }
    }

    // Özellikler
    for (const pattern of this.vesselPatterns.features) {
      if (pattern.test(text)) {
        const feature = this.extractFeatureName(pattern, text);
        if (feature && !vessel.features!.includes(feature)) {
          vessel.features!.push(feature);
        }
      }
    }

    return vessel as ParsedVessel;
  }

  /**
   * Yük bilgilerini çıkarır
   */
  private extractCargoInfo(text: string): ParsedCargo | null {
    const cargo: Partial<ParsedCargo> = {
      requirements: [],
      stowageFactorUnit: 'cuft/mt',
      brokenStowagePct: 5.0
    };

    // Yük miktarı ve türü
    for (const pattern of this.cargoPatterns.quantity) {
      const match = text.match(pattern);
      if (match) {
        cargo.quantity = this.parseNumber(match[1]);
        cargo.reference = match[2] ? match[2].trim() : `${match[1]} MT cargo`;
        break;
      }
    }

    if (!cargo.quantity) {
      // Eğer miktarlı yük bulunamazsa, genel yük referansı ara
      const generalCargoMatch = text.match(/CARGO[:\s]+([A-Z\s\d]+)/i);
      if (generalCargoMatch) {
        cargo.reference = generalCargoMatch[1].trim();
      } else {
        return null; // Yük bilgisi bulunamazsa null döndür
      }
    }

    // Yükleme limanı
    for (const pattern of this.cargoPatterns.loadPort) {
      const match = text.match(pattern);
      if (match) {
        cargo.loadPort = match[1].trim();
        break;
      }
    }

    // Laycan
    const laycanMatch = text.match(this.cargoPatterns.laycan[0]);
    if (laycanMatch) {
      cargo.laycanStart = this.parseDate(laycanMatch[1]);
      cargo.laycanEnd = this.parseDate(laycanMatch[2]);
    }

    // Stowage Factor
    for (const pattern of this.cargoPatterns.stowageFactor) {
      const match = text.match(pattern);
      if (match) {
        cargo.stowageFactorValue = parseFloat(match[1]);
        cargo.stowageFactorUnit = match[2].toLowerCase().replace('/', '/');
        break;
      }
    }

    // Broken Stowage
    for (const pattern of this.cargoPatterns.brokenStowage) {
      const match = text.match(pattern);
      if (match) {
        cargo.brokenStowagePct = parseFloat(match[1]);
        break;
      }
    }

    // Gereksinimler
    for (const pattern of this.cargoPatterns.requirements) {
      if (pattern.test(text)) {
        const requirement = this.extractFeatureName(pattern, text);
        if (requirement && !cargo.requirements!.includes(requirement)) {
          cargo.requirements!.push(requirement);
        }
      }
    }

    return cargo as ParsedCargo;
  }

  /**
   * DOCX dosyasından text çıkarır
   */
  private async extractTextFromDocx(buffer: Buffer): Promise<string> {
    try {
      // Bu basit bir implementasyon - gerçek projede daha gelişmiş bir DOCX parser kullanılabilir
      const doc = new Document();
      // Placeholder - gerçek DOCX text extraction implementasyonu gerekli
      return buffer.toString('utf8');
    } catch (error) {
      logger.error('DOCX text extraction error:', error);
      throw new Error('DOCX dosyası okunamadı');
    }
  }

  /**
   * Sayısal değerleri parse eder (virgül/nokta ayırıcıları ile)
   */
  private parseNumber(str: string): number {
    return parseFloat(str.replace(/[,]/g, ''));
  }

  /**
   * Tarih parse eder
   */
  private parseDate(dateStr: string): Date {
    // DD/MM veya DD-MM formatını destekle
    const parts = dateStr.split(/[-\/]/);
    if (parts.length === 2) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // JS'de aylar 0-based
      const year = new Date().getFullYear(); // Mevcut yıl
      return new Date(year, month, day);
    }
    throw new Error(`Geçersiz tarih formatı: ${dateStr}`);
  }

  /**
   * Pattern'den özellik adını çıkarır
   */
  private extractFeatureName(pattern: RegExp, text: string): string {
    const match = text.match(pattern);
    if (match) {
      const feature = match[1] || match[0];
      return feature.toLowerCase().replace(/\s+/g, '_');
    }
    return '';
  }

  /**
   * Parse edilen verileri veritabanına kaydeder
   */
  async saveToDatabase(parseResult: ParseResult, sourceEmailId?: number): Promise<{
    vesselIds: number[];
    cargoIds: number[];
  }> {
    const vesselIds: number[] = [];
    const cargoIds: number[] = [];

    try {
      // Gemileri kaydet
      for (const vessel of parseResult.vessels) {
        const savedVessel = await prisma.vessel.create({
          data: {
            name: vessel.name,
            dwt: vessel.dwt || 0,
            grainCuft: vessel.grainCuft,
            baleCuft: vessel.baleCuft,
            speedKnots: vessel.speedKnots || 12.0,
            features: vessel.features,
            currentPort: vessel.currentPort,
            laycanStart: vessel.laycanStart,
            laycanEnd: vessel.laycanEnd,
            sourceEmailId: sourceEmailId
          }
        });
        vesselIds.push(savedVessel.id);
      }

      // Yükleri kaydet
      for (const cargo of parseResult.cargos) {
        if (cargo.laycanStart && cargo.laycanEnd) {
          const savedCargo = await prisma.cargo.create({
            data: {
              reference: cargo.reference,
              loadPort: cargo.loadPort || 'Unknown',
              laycanStart: cargo.laycanStart,
              laycanEnd: cargo.laycanEnd,
              quantity: cargo.quantity || 0,
              stowageFactorValue: cargo.stowageFactorValue,
              stowageFactorUnit: cargo.stowageFactorUnit,
              brokenStowagePct: cargo.brokenStowagePct,
              requirements: cargo.requirements,
              sourceEmailId: sourceEmailId
            }
          });
          cargoIds.push(savedCargo.id);
        }
      }

      logger.info(`Veritabanına kaydedildi: ${vesselIds.length} gemi, ${cargoIds.length} yük`);

    } catch (error) {
      logger.error('Veritabanına kaydetme hatası:', error);
      throw error;
    }

    return { vesselIds, cargoIds };
  }
}
