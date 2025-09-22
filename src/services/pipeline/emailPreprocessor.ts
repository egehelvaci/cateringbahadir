// import { logger } from '../../utils/logger';

interface PreprocessedEmail {
  originalText: string;
  cleanedText: string;
  normalizedNumbers: Map<string, number>;
  detectedPorts: string[];
  detectedDates: string[];
  detectedVesselNames: string[];
  detectedUnits: Map<string, { value: number; unit: string }>;
  language?: string;
  confidence: number;
}

export class EmailPreprocessor {
  private portDatabase: Set<string>;
  private vesselPrefixes = ['MV', 'M/V', 'SS', 'MT', 'M/T', 'MS', 'M/S'];
  
  constructor() {
    // Common port names - in production, load from UN/LOCODE database
    this.portDatabase = new Set([
      'singapore', 'rotterdam', 'shanghai', 'houston', 'hamburg', 'santos',
      'yokohama', 'antwerp', 'dubai', 'hong kong', 'busan', 'ningbo',
      'qingdao', 'tianjin', 'guangzhou', 'jebel ali', 'port said',
      'sohar', 'odessa', 'chornomorsk', 'istanbul', 'piraeus', 'valencia'
    ]);
  }

  /**
   * Main preprocessing pipeline
   */
  async preprocess(emailText: string): Promise<PreprocessedEmail> {
    let cleanedText = emailText;
    
    // Step 1: Basic cleaning
    cleanedText = this.removeHtmlTags(cleanedText);
    cleanedText = this.normalizeWhitespace(cleanedText);
    cleanedText = this.removeSignatures(cleanedText);
    
    // Step 2: Extract entities
    const normalizedNumbers = this.extractAndNormalizeNumbers(cleanedText);
    const detectedPorts = this.detectPorts(cleanedText);
    const detectedDates = this.detectDates(cleanedText);
    const detectedVesselNames = this.detectVesselNames(cleanedText);
    const detectedUnits = this.extractUnits(cleanedText);
    
    // Step 3: Language detection (simplified)
    const language = this.detectLanguage(cleanedText);
    
    // Step 4: Normalize text
    cleanedText = this.normalizeAbbreviations(cleanedText);
    cleanedText = this.expandContractions(cleanedText);
    
    // Calculate preprocessing confidence
    const confidence = this.calculateConfidence({
      hasNumbers: normalizedNumbers.size > 0,
      hasPorts: detectedPorts.length > 0,
      hasDates: detectedDates.length > 0,
      hasUnits: detectedUnits.size > 0
    });
    
    return {
      originalText: emailText,
      cleanedText,
      normalizedNumbers,
      detectedPorts,
      detectedDates,
      detectedVesselNames,
      detectedUnits,
      language,
      confidence
    };
  }

  private removeHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, ' ').trim();
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private removeSignatures(text: string): string {
    // Remove common email signatures
    const signaturePatterns = [
      /best regards[\s\S]*/i,
      /sincerely[\s\S]*/i,
      /regards[\s\S]*/i,
      /thanks[\s\S]*$/i,
      /^--[\s\S]*/m
    ];
    
    let result = text;
    for (const pattern of signaturePatterns) {
      const match = result.match(pattern);
      if (match && match.index && match.index > text.length * 0.5) {
        result = result.substring(0, match.index);
      }
    }
    return result;
  }

  private extractAndNormalizeNumbers(text: string): Map<string, number> {
    const numberMap = new Map<string, number>();
    
    // Extract quantities with units
    const patterns = [
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(MT|mt|tons?|tonnes?)/gi,
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(DWT|dwt)/gi,
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(TEU|teu|FEU|feu)/gi,
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(cbm|CBM|m3|M3)/gi,
      /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(%|percent|pct)/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        const value = parseFloat(match[1].replace(/,/g, ''));
        const unit = match[2].toUpperCase();
        numberMap.set(`${value}_${unit}`, value);
      });
    });
    
    return numberMap;
  }

  private detectPorts(text: string): string[] {
    const detectedPorts: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Check against known ports
    this.portDatabase.forEach(port => {
      if (lowerText.includes(port)) {
        detectedPorts.push(port);
      }
    });
    
    // Detect port patterns
    const portPatterns = [
      /(?:from|ex|loading at?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      /(?:to|discharge at?|discharging at?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      /(?:port of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g
    ];
    
    portPatterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        const port = match[1].toLowerCase();
        if (!detectedPorts.includes(port)) {
          detectedPorts.push(port);
        }
      });
    });
    
    return detectedPorts;
  }

  private detectDates(text: string): string[] {
    const dates: string[] = [];
    
    // Common date patterns
    const datePatterns = [
      /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/g,
      /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g,
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi,
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/gi,
      /laycan\s*:?\s*(\d{1,2}[-–]\d{1,2}\s+\w+)/gi,
      /eta\s*:?\s*([^,\n]+)/gi
    ];
    
    datePatterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        dates.push(match[0]);
      });
    });
    
    return dates;
  }

  private detectVesselNames(text: string): string[] {
    const vessels: string[] = [];
    
    // Detect vessel name patterns
    this.vesselPrefixes.forEach(prefix => {
      const pattern = new RegExp(`${prefix}\\s+([A-Z][A-Za-z\\s]+)`, 'g');
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        const vesselName = match[1].trim();
        if (vesselName.length > 2 && vesselName.length < 50) {
          vessels.push(`${prefix} ${vesselName}`);
        }
      });
    });
    
    return vessels;
  }

  private extractUnits(text: string): Map<string, { value: number; unit: string }> {
    const units = new Map<string, { value: number; unit: string }>();
    
    // Maritime-specific units
    const unitPatterns = [
      { pattern: /(\d+(?:\.\d+)?)\s*(m|meters?|metres?)\s+(?:loa|length)/gi, unit: 'LOA' },
      { pattern: /(\d+(?:\.\d+)?)\s*(m|meters?|metres?)\s+(?:beam|width)/gi, unit: 'BEAM' },
      { pattern: /(\d+(?:\.\d+)?)\s*(m|meters?|metres?)\s+(?:draft|draught)/gi, unit: 'DRAFT' },
      { pattern: /(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:t|ton|tons)/gi, unit: 'CRANE' },
      { pattern: /(\d+)\s*(?:holds?)/gi, unit: 'HOLDS' },
      { pattern: /(\d+)\s*(?:hatches)/gi, unit: 'HATCHES' }
    ];
    
    unitPatterns.forEach(({ pattern, unit }) => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        const value = parseFloat(match[1]);
        units.set(unit, { value, unit });
      });
    });
    
    return units;
  }

  private detectLanguage(text: string): string {
    // Simplified language detection based on common words
    const englishWords = /\b(the|and|or|but|in|on|at|to|for|of|with|from|vessel|cargo|ship)\b/gi;
    const englishMatches = (text.match(englishWords) || []).length;
    
    if (englishMatches > 5) {
      return 'en';
    }
    
    return 'unknown';
  }

  private normalizeAbbreviations(text: string): string {
    const abbreviations: Record<string, string> = {
      'mt': 'metric tons',
      'dwt': 'deadweight tonnage',
      'loa': 'length overall',
      'teu': 'twenty-foot equivalent unit',
      'feu': 'forty-foot equivalent unit',
      'cbm': 'cubic meters',
      'eta': 'estimated time of arrival',
      'etb': 'estimated time of berthing',
      'etd': 'estimated time of departure',
      'tc': 'time charter',
      'vc': 'voyage charter'
    };
    
    let normalized = text;
    Object.entries(abbreviations).forEach(([abbr, full]) => {
      const pattern = new RegExp(`\\b${abbr}\\b`, 'gi');
      normalized = normalized.replace(pattern, full);
    });
    
    return normalized;
  }

  private expandContractions(text: string): string {
    const contractions: Record<string, string> = {
      "don't": "do not",
      "won't": "will not",
      "can't": "cannot",
      "n't": " not",
      "'re": " are",
      "'ve": " have",
      "'ll": " will",
      "'d": " would",
      "'m": " am"
    };
    
    let expanded = text;
    Object.entries(contractions).forEach(([contraction, expansion]) => {
      const pattern = new RegExp(contraction, 'gi');
      expanded = expanded.replace(pattern, expansion);
    });
    
    return expanded;
  }

  private calculateConfidence(indicators: {
    hasNumbers: boolean;
    hasPorts: boolean;
    hasDates: boolean;
    hasUnits: boolean;
  }): number {
    let score = 0.5; // Base confidence
    
    if (indicators.hasNumbers) score += 0.15;
    if (indicators.hasPorts) score += 0.15;
    if (indicators.hasDates) score += 0.1;
    if (indicators.hasUnits) score += 0.1;
    
    return Math.min(score, 1.0);
  }
}