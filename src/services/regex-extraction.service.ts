import { logger } from '../utils/logger';

export interface RegexExtractionResult {
  confidence: number; // 0-1 how complete the extraction is
  extractedFields: {
    // Dates
    laycan?: {
      start?: string;
      end?: string;
      raw: string;
    };
    
    // Quantities
    quantity?: {
      value?: number;
      unit?: string;
      tolerance?: string; // +/- 1250 MT
      raw: string;
    };
    
    // Vessel requirements
    dwt?: {
      min?: number;
      max?: number;
      raw: string;
    };
    
    // Ports
    loadPort?: string;
    dischargePort?: string;
    
    // Rates
    loadingRate?: {
      value?: number;
      unit?: string; // t/day, pdpr
      raw: string;
    };
    dischargingRate?: {
      value?: number;
      unit?: string;
      raw: string;
    };
    
    // Commodity
    commodity?: string;
    cargoType?: string;
    
    // Constraints
    constraints?: string[];
    
    // Commission
    commission?: {
      value?: number;
      raw: string;
    };
    
    // Vessel specs
    vesselAge?: {
      max?: number;
      raw: string;
    };
    
    excludeFlags?: string[];
    craneCap?: string;
    vesselType?: string;
    
    // Freight
    freightIdea?: string;
    charterer?: string;
  };
  matchedPatterns: string[]; // Which regex patterns matched
  unmatched: string[]; // Important fields that couldn't be extracted
}

export class RegexExtractionService {
  
  // Maritime port patterns (expand as needed)
  private static PORTS = new Set([
    'odessa', 'chornomorsk', 'sohar', 'zhangjiagang', 'varna', 'rotterdam',
    'hamburg', 'antwerp', 'le havre', 'singapore', 'shanghai', 'ningbo',
    'qingdao', 'tianjin', 'dalian', 'guangzhou', 'shenzhen', 'xiamen',
    'constanta', 'novorossiysk', 'tuapse', 'kavkaz', 'poti', 'batumi',
    'istanbul', 'izmir', 'mersin', 'iskenderun', 'bandirma', 'aliaga',
    'piraeus', 'thessaloniki', 'volos', 'patras', 'heraklion',
    'barcelona', 'valencia', 'algeciras', 'bilbao', 'tarragona',
    'genoa', 'la spezia', 'livorno', 'venice', 'trieste', 'bari',
    'marseille', 'dunkirk', 'nantes', 'bordeaux',
    'felixstowe', 'southampton', 'london', 'liverpool', 'hull',
    'casablanca', 'tangier', 'agadir', 'alexandria', 'damietta', 'suez',
    'jebel ali', 'fujairah', 'bandar abbas', 'bushehr', 'khorramshahr',
    'mumbai', 'nhava sheva', 'kandla', 'cochin', 'chennai', 'vizag',
    'paradip', 'haldia', 'kolkata', 'tuticorin',
    'colombo', 'chittagong', 'mongla', 'karachi', 'qasim',
    'busan', 'incheon', 'ulsan', 'pohang', 'mokpo',
    'kobe', 'nagoya', 'yokohama', 'tokyo', 'osaka', 'hakata',
    'manila', 'cebu', 'bataan', 'subic bay',
    'ho chi minh', 'haiphong', 'danang', 'vung tau',
    'bangkok', 'laem chabang', 'map ta phut',
    'jakarta', 'surabaya', 'semarang', 'belawan', 'dumai',
    'kuala lumpur', 'port klang', 'penang', 'johor',
    'fremantle', 'melbourne', 'sydney', 'brisbane', 'adelaide',
    'auckland', 'wellington', 'tauranga', 'lyttelton',
    'vancouver', 'montreal', 'halifax', 'thunder bay', 'hamilton',
    'new york', 'los angeles', 'long beach', 'savannah', 'charleston',
    'houston', 'new orleans', 'mobile', 'baltimore', 'philadelphia',
    'seattle', 'tacoma', 'oakland', 'miami', 'jacksonville'
  ]);

  private static COMMODITIES = new Set([
    'coal', 'iron ore', 'grain', 'wheat', 'corn', 'soybean', 'barley', 'rice',
    'steel', 'steel pipes', 'steel billets', 'steel coils', 'steel plates',
    'scrap', 'scrap metal', 'hms', 'shredded scrap',
    'fertilizer', 'urea', 'dap', 'map', 'potash', 'phosphate',
    'cement', 'clinker', 'limestone', 'gypsum', 'bauxite', 'alumina',
    'salt', 'rock salt', 'sugar', 'taconite', 'pellets', 'concentrates',
    'coke', 'met coke', 'petroleum coke', 'petcoke',
    'logs', 'timber', 'wood chips', 'wood pellets',
    'containers', 'general cargo', 'project cargo', 'breakbulk',
    'crude oil', 'fuel oil', 'gasoil', 'gasoline', 'naphtha', 'lng', 'lpg',
    'chemicals', 'methanol', 'ammonia', 'sulphuric acid',
    'sand', 'aggregate', 'gravel', 'clay', 'kaolin'
  ]);

  extractFromText(text: string): RegexExtractionResult {
    const cleanText = this.cleanText(text);
    const result: RegexExtractionResult = {
      confidence: 0,
      extractedFields: {},
      matchedPatterns: [],
      unmatched: []
    };

    // Extract different components
    this.extractLaycan(cleanText, result);
    this.extractQuantity(cleanText, result);
    this.extractDWT(cleanText, result);
    this.extractPorts(cleanText, result);
    this.extractRates(cleanText, result);
    this.extractCommodity(cleanText, result);
    this.extractConstraints(cleanText, result);
    this.extractCommission(cleanText, result);
    this.extractVesselSpecs(cleanText, result);
    this.extractCharterer(cleanText, result);
    this.extractFreightIdea(cleanText, result);

    // Calculate confidence based on extracted fields
    result.confidence = this.calculateConfidence(result);

    logger.info(`Regex extraction completed with ${result.confidence.toFixed(2)} confidence, matched patterns: ${result.matchedPatterns.join(', ')}`);

    return result;
  }

  private cleanText(text: string): string {
    // Remove HTML tags
    let cleaned = text.replace(/<[^>]*>/g, ' ');
    
    // Remove email signatures and legal disclaimers
    cleaned = cleaned.replace(/^.*?(?:best regards?|regards?|br\/|brgds)[\s\S]*$/im, '');
    cleaned = cleaned.replace(/^.*?(?:disclaimer|confidential|privileged)[\s\S]*$/im, '');
    cleaned = cleaned.replace(/^.*?(?:this email|the contents|intended recipient)[\s\S]*$/im, '');
    
    // Remove quoted text
    cleaned = cleaned.replace(/^>.*$/gm, '');
    cleaned = cleaned.replace(/^From:.*$/gm, '');
    cleaned = cleaned.replace(/^To:.*$/gm, '');
    cleaned = cleaned.replace(/^Sent:.*$/gm, '');
    cleaned = cleaned.replace(/^Subject:.*$/gm, '');
    
    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  private extractLaycan(text: string, result: RegexExtractionResult): void {
    const patterns = [
      // Standard formats: 10-15 Aug, 15-20 Sep 2025
      /(?:laycan|l\/c|loading|load)[:\s]*(\d{1,2})\s*[-\/]\s*(\d{1,2})\s+([a-z]{3,})\s*(\d{4})?/gi,
      // Alternative: Aug 10-15, September 15-20
      /(?:laycan|l\/c|loading|load)[:\s]*([a-z]{3,})\s+(\d{1,2})\s*[-\/]\s*(\d{1,2})(?:\s+(\d{4}))?/gi,
      // Simple: 10/15 Aug 2025
      /(\d{1,2})\/(\d{1,2})\s+([a-z]{3,})\s*(\d{4})?/gi,
      // LC opening: 15–19 September 2025
      /(?:lc|l\/c)?\s*(?:opening)?[:\s]*(\d{1,2})\s*[–-]\s*(\d{1,2})\s+([a-z]{3,})\s*(\d{4})?/gi
    ];

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        result.extractedFields.laycan = {
          raw: match[0],
          start: this.parseDate(match[1], match[2] || match[3], match[3] || match[4] || match[2], match[4]),
          end: this.parseDate(match[2] || match[3], match[2] || match[3], match[3] || match[4] || match[2], match[4])
        };
        result.matchedPatterns.push('laycan');
        break;
      }
      if (result.extractedFields.laycan) break;
    }
  }

  private extractQuantity(text: string, result: RegexExtractionResult): void {
    const patterns = [
      // 21,400 MT ± 1,250 MT
      /(\d{1,3}(?:,\d{3})*)\s*mt\s*[±+\-]\s*(\d{1,3}(?:,\d{3})*)\s*mt/gi,
      // 38,000 ts ± 10%
      /(\d{1,3}(?:,\d{3})*)\s*(mt|ts|tons?)\s*[±+\-]?\s*(\d+)%?/gi,
      // Simple: 25000 MT, 25,000 tons
      /(\d{1,3}(?:,\d{3})*)\s*(mt|ts|tons?|metric\s*tons?)/gi
    ];

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const value = parseInt(match[1].replace(/,/g, ''));
        result.extractedFields.quantity = {
          value,
          unit: this.normalizeUnit(match[2]),
          tolerance: match[3] ? `±${match[3]}${match[2].includes('%') ? '%' : ' ' + this.normalizeUnit(match[2])}` : undefined,
          raw: match[0]
        };
        result.matchedPatterns.push('quantity');
        break;
      }
      if (result.extractedFields.quantity) break;
    }
  }

  private extractDWT(text: string, result: RegexExtractionResult): void {
    const patterns = [
      // 27,000 – 47,000 DWT
      /(\d{1,3}(?:[,\.]\d{3})*)\s*[–-]\s*(\d{1,3}(?:[,\.]\d{3})*)\s*dwt/gi,
      // Need 30k+ DWT, 2500 dwt for
      /(?:need|require|looking\s*for)\s*(\d{1,3}(?:[,\.]\d{3})*)\s*k?\+?\s*dwt/gi,
      // Single DWT: 12399 DWT
      /(\d{3,6})\s*dwt/gi,
      // Range with slash: 27/47k DWT
      /(\d{1,3})\/(\d{1,3})k?\s*dwt/gi
    ];

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const dwt1 = this.parseDWTNumber(match[1]);
        const dwt2 = match[2] ? this.parseDWTNumber(match[2]) : undefined;
        
        result.extractedFields.dwt = {
          min: dwt2 ? Math.min(dwt1, dwt2) : dwt1,
          max: dwt2 ? Math.max(dwt1, dwt2) : undefined,
          raw: match[0]
        };
        result.matchedPatterns.push('dwt');
        break;
      }
      if (result.extractedFields.dwt) break;
    }
  }

  private extractPorts(text: string, result: RegexExtractionResult): void {
    const lowerText = text.toLowerCase();
    
    // Find load/discharge patterns
    const loadPatterns = [
      /(?:load(?:ing)?|from|ex)[:\s]+([a-z\s,]+?)(?=\s*(?:to|disch|\/|\n|$))/gi,
      /^([a-z\s,]+?)\s*\/\s*([a-z\s,]+)$/gm // Simple format: Port1 / Port2
    ];
    
    const dischargePatterns = [
      /(?:disch(?:arg(?:e|ing)?)?|to)[:\s]+([a-z\s,]+?)(?=\s*(?:\.|,|\n|$))/gi
    ];

    // Extract load ports
    for (const pattern of loadPatterns) {
      const matches = [...lowerText.matchAll(pattern)];
      for (const match of matches) {
        const port = this.findPortInText(match[1]);
        if (port) {
          result.extractedFields.loadPort = port;
          result.matchedPatterns.push('loadPort');
          break;
        }
      }
      if (result.extractedFields.loadPort) break;
    }

    // Extract discharge ports
    for (const pattern of dischargePatterns) {
      const matches = [...lowerText.matchAll(pattern)];
      for (const match of matches) {
        const port = this.findPortInText(match[1]);
        if (port) {
          result.extractedFields.dischargePort = port;
          result.matchedPatterns.push('dischargePort');
          break;
        }
      }
      if (result.extractedFields.dischargePort) break;
    }

    // Also check for known ports anywhere in text
    for (const port of RegexExtractionService.PORTS) {
      if (lowerText.includes(port)) {
        if (!result.extractedFields.loadPort) {
          result.extractedFields.loadPort = port;
          result.matchedPatterns.push('loadPort');
        } else if (!result.extractedFields.dischargePort && port !== result.extractedFields.loadPort) {
          result.extractedFields.dischargePort = port;
          result.matchedPatterns.push('dischargePort');
        }
      }
    }
  }

  private extractRates(text: string, result: RegexExtractionResult): void {
    const patterns = [
      // Loading/discharging rates: 3,500 t/day, 2500 tons per day
      /(?:load(?:ing)?)[:\s]*(\d{1,3}(?:,\d{3})*)\s*(?:t\/day|tons?\s*(?:per\s*)?day|pdpr)/gi,
      /(?:disch(?:arg(?:e|ing)?)?)[:\s]*(\d{1,3}(?:,\d{3})*)\s*(?:t\/day|tons?\s*(?:per\s*)?day|pdpr)/gi,
      // Generic rate patterns
      /(\d{1,3}(?:,\d{3})*)\s*t\s*pdpr/gi,
      /(\d{1,3}(?:,\d{3})*)\s*(?:t\/day|tons?\s*(?:per\s*)?day)/gi
    ];

    let loadingFound = false;
    let dischargingFound = false;

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const value = parseInt(match[1].replace(/,/g, ''));
        const isLoading = /load/i.test(match[0]);
        const isDischarging = /disch/i.test(match[0]);
        
        if (isLoading && !loadingFound) {
          result.extractedFields.loadingRate = {
            value,
            unit: 't/day',
            raw: match[0]
          };
          result.matchedPatterns.push('loadingRate');
          loadingFound = true;
        } else if (isDischarging && !dischargingFound) {
          result.extractedFields.dischargingRate = {
            value,
            unit: 't/day', 
            raw: match[0]
          };
          result.matchedPatterns.push('dischargingRate');
          dischargingFound = true;
        } else if (!loadingFound && !dischargingFound) {
          // First rate found - assume loading
          result.extractedFields.loadingRate = {
            value,
            unit: 't/day',
            raw: match[0]
          };
          result.matchedPatterns.push('loadingRate');
          loadingFound = true;
        } else if (loadingFound && !dischargingFound) {
          // Second rate - assume discharging
          result.extractedFields.dischargingRate = {
            value,
            unit: 't/day',
            raw: match[0]
          };
          result.matchedPatterns.push('dischargingRate');
          dischargingFound = true;
        }
      }
    }
  }

  private extractCommodity(text: string, result: RegexExtractionResult): void {
    const lowerText = text.toLowerCase();
    
    // Check for specific commodities
    for (const commodity of RegexExtractionService.COMMODITIES) {
      if (lowerText.includes(commodity)) {
        result.extractedFields.commodity = commodity;
        result.matchedPatterns.push('commodity');
        break;
      }
    }

    // Extract cargo type patterns
    const cargoPatterns = [
      /(?:cargo|commodity|product)[:\s]*([a-z0-9\s,.-]+?)(?=\s*(?:\.|,|;|\n|$))/gi,
      /(steel\s+(?:pipes|billets|coils|plates|sheets))/gi,
      /(pet\s+granul[es]?)/gi
    ];

    for (const pattern of cargoPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (!result.extractedFields.cargoType) {
          result.extractedFields.cargoType = match[1].trim();
          result.matchedPatterns.push('cargoType');
          break;
        }
      }
    }
  }

  private extractConstraints(text: string, result: RegexExtractionResult): void {
    const constraintPatterns = [
      /no\s+transshipment/gi,
      /solo\s+cargo/gi,
      /box[\s-]?shaped/gi,
      /no\s+side\s+shoring/gi,
      /age\s+max?\s*(\d+)/gi,
      /max\s+age\s*(\d+)/gi,
      /no\s+(iran|iraq)/gi,
      /exclude\s+(iran|iraq)/gi,
      /(\d+)\s*x\s*(\d+)\s*mt\s+swl/gi, // crane capacity
      /minimum\s+(\d+)\s*x\s*(\d+)\s*mt/gi
    ];

    result.extractedFields.constraints = [];

    for (const pattern of constraintPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        result.extractedFields.constraints.push(match[0]);
        result.matchedPatterns.push('constraints');
        
        // Extract specific constraint details
        if (match[0].match(/age/i)) {
          result.extractedFields.vesselAge = {
            max: parseInt(match[1]),
            raw: match[0]
          };
        }
        
        if (match[0].match(/iran|iraq/i)) {
          if (!result.extractedFields.excludeFlags) {
            result.extractedFields.excludeFlags = [];
          }
          result.extractedFields.excludeFlags.push(match[1].toLowerCase());
        }
        
        if (match[0].match(/swl|mt/i)) {
          result.extractedFields.craneCap = match[0];
        }
      }
    }
  }

  private extractCommission(text: string, result: RegexExtractionResult): void {
    const patterns = [
      // %1,25, 3.75%, comm 2.5%
      /(?:comm(?:ission)?|ttl)[:\s]*(\d+(?:[,\.]\d+)?)\s*%/gi,
      /(\d+(?:[,\.]\d+)?)\s*%\s*(?:comm(?:ission)?|ttl)/gi
    ];

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        result.extractedFields.commission = {
          value: parseFloat(match[1].replace(',', '.')),
          raw: match[0]
        };
        result.matchedPatterns.push('commission');
        break;
      }
      if (result.extractedFields.commission) break;
    }
  }

  private extractVesselSpecs(text: string, result: RegexExtractionResult): void {
    // Already handled age and flags in constraints
    
    // Extract vessel type
    const vesselTypes = [
      'bulk carrier', 'container', 'general cargo', 'tanker', 'handymax', 
      'supramax', 'panamax', 'capesize', 'handysize', 'suezmax', 'vlcc',
      'gen cargo', 'multipurpose', 'mpp'
    ];

    const lowerText = text.toLowerCase();
    for (const vesselType of vesselTypes) {
      if (lowerText.includes(vesselType)) {
        result.extractedFields.vesselType = vesselType;
        result.matchedPatterns.push('vesselType');
        break;
      }
    }
  }

  private extractCharterer(text: string, result: RegexExtractionResult): void {
    const patterns = [
      /(?:acnt|account|charterer|firma)[:\s]*([a-z0-9\s&.-]+?)(?=\s*(?:\.|,|\n|$))/gi,
      /(?:for|on\s+behalf\s+of)[:\s]*([a-z0-9\s&.-]+?)(?=\s*(?:\.|,|\n|$))/gi
    ];

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const charterer = match[1].trim();
        if (charterer.length > 2 && charterer.length < 50) { // reasonable length
          result.extractedFields.charterer = charterer;
          result.matchedPatterns.push('charterer');
          break;
        }
      }
      if (result.extractedFields.charterer) break;
    }
  }

  private extractFreightIdea(text: string, result: RegexExtractionResult): void {
    const patterns = [
      /(?:frt\s*idea|freight\s*idea|rate)[:\s]*([a-z0-9\s$.-]+?)(?=\s*(?:\.|,|\n|$))/gi,
      /(low\s+\d+|high\s+\d+|\d+\s*usd)/gi
    ];

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        result.extractedFields.freightIdea = match[1] || match[0];
        result.matchedPatterns.push('freightIdea');
        break;
      }
      if (result.extractedFields.freightIdea) break;
    }
  }

  // Helper methods
  private parseDate(day1: string, _day2: string, month: string, year?: string): string | undefined {
    if (!day1 || !month) return undefined;
    
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                   'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    const monthIndex = months.findIndex(m => month.toLowerCase().startsWith(m));
    if (monthIndex === -1) return undefined;
    
    const currentYear = new Date().getFullYear();
    const targetYear = year ? parseInt(year) : currentYear;
    const day = parseInt(day1);
    
    if (day < 1 || day > 31) return undefined;
    
    return `${targetYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private normalizeUnit(unit: string): string {
    const lower = unit.toLowerCase();
    if (lower.includes('mt') || lower.includes('metric')) return 'MT';
    if (lower.includes('ton')) return 'tons';
    if (lower.includes('ts')) return 'tons';
    return unit;
  }

  private parseDWTNumber(dwt: string): number {
    const cleaned = dwt.replace(/[,\.]/g, '');
    let number = parseInt(cleaned);
    
    // Handle k suffix (thousands)
    if (dwt.toLowerCase().includes('k')) {
      number *= 1000;
    }
    
    return number;
  }

  private findPortInText(text: string): string | undefined {
    const normalized = text.toLowerCase().trim();
    
    // Direct match
    if (RegexExtractionService.PORTS.has(normalized)) {
      return normalized;
    }
    
    // Partial match
    for (const port of RegexExtractionService.PORTS) {
      if (normalized.includes(port) || port.includes(normalized)) {
        return port;
      }
    }
    
    return undefined;
  }

  private calculateConfidence(result: RegexExtractionResult): number {
    const fields = result.extractedFields;
    let score = 0;
    let maxScore = 0;

    // Core fields (higher weight)
    const coreFields = [
      { key: 'commodity', weight: 15 },
      { key: 'quantity', weight: 15 },
      { key: 'loadPort', weight: 12 },
      { key: 'dischargePort', weight: 12 },
      { key: 'laycan', weight: 10 }
    ];

    // Important fields (medium weight)
    const importantFields = [
      { key: 'dwt', weight: 8 },
      { key: 'loadingRate', weight: 6 },
      { key: 'dischargingRate', weight: 6 },
      { key: 'commission', weight: 5 }
    ];

    // Nice-to-have fields (lower weight)
    const optionalFields = [
      { key: 'charterer', weight: 3 },
      { key: 'freightIdea', weight: 3 },
      { key: 'constraints', weight: 4 },
      { key: 'vesselAge', weight: 2 },
      { key: 'craneCap', weight: 2 }
    ];

    // Calculate scores
    const allFields = [...coreFields, ...importantFields, ...optionalFields];
    
    for (const field of allFields) {
      maxScore += field.weight;
      if (fields[field.key as keyof typeof fields]) {
        score += field.weight;
      }
    }

    return Math.min(1, score / maxScore);
  }
}