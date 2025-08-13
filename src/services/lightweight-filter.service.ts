import { RegexExtractionResult } from './regex-extraction.service';
import { logger } from '../utils/logger';

export interface FilterDecision {
  shouldUseLLM: boolean;
  reason: string;
  confidence: number;
  missingCriticalFields: string[];
  extractionQuality: 'excellent' | 'good' | 'poor' | 'insufficient';
}

export class LightweightFilterService {
  
  // Critical fields that we always want to have
  private static CRITICAL_FIELDS = new Set([
    'commodity', 'quantity', 'loadPort', 'dischargePort', 'laycan'
  ]);

  // Important fields that significantly improve quality
  private static IMPORTANT_FIELDS = new Set([
    'dwt', 'loadingRate', 'dischargingRate', 'commission', 'charterer'
  ]);

  // Maritime-specific terms that indicate this is a legitimate shipping inquiry
  private static SHIPPING_INDICATORS = new Set([
    'laycan', 'dwt', 'charter', 'freight', 'cargo', 'vessel', 'ship',
    'loading', 'discharging', 'mt', 'tons', 'pdpr', 'commission', 'ttl',
    'bulker', 'tanker', 'handymax', 'supramax', 'panamax', 'capesize',
    'ballast', 'laden', 'fixture', 'owner', 'charterer', 'broker'
  ]);

  // Non-shipping content indicators (spam/irrelevant)
  private static NON_SHIPPING_INDICATORS = new Set([
    'unsubscribe', 'marketing', 'promotion', 'sale', 'discount', 'offer',
    'newsletter', 'update', 'notification', 'social media', 'facebook',
    'instagram', 'twitter', 'advertisement', 'shopping', 'ecommerce',
    'click here', 'free trial', 'limited time', 'act now', 'urgent',
    'congratulations', 'winner', 'prize', 'lottery'
  ]);

  evaluateExtraction(regexResult: RegexExtractionResult, originalText: string): FilterDecision {
    const decision: FilterDecision = {
      shouldUseLLM: false,
      reason: '',
      confidence: regexResult.confidence,
      missingCriticalFields: [],
      extractionQuality: 'insufficient'
    };

    // Step 1: Check if this looks like a shipping email at all
    const shippingScore = this.calculateShippingScore(originalText);
    if (shippingScore < 0.3) {
      decision.reason = 'Content does not appear to be shipping-related';
      decision.extractionQuality = 'insufficient';
      return decision;
    }

    // Step 2: Evaluate regex extraction quality
    decision.extractionQuality = this.evaluateExtractionQuality(regexResult);
    decision.missingCriticalFields = this.findMissingCriticalFields(regexResult);

    // Step 3: Make LLM decision based on quality
    const llmDecision = this.decideLLMUsage(decision.extractionQuality, decision.missingCriticalFields, regexResult);
    
    decision.shouldUseLLM = llmDecision.shouldUse;
    decision.reason = llmDecision.reason;

    logger.info(`Filter decision: ${decision.shouldUseLLM ? 'USE LLM' : 'SKIP LLM'} - ${decision.reason} (quality: ${decision.extractionQuality}, confidence: ${decision.confidence.toFixed(2)})`);

    return decision;
  }

  private calculateShippingScore(text: string): number {
    const lowerText = text.toLowerCase();
    
    let shippingTermCount = 0;
    let nonShippingTermCount = 0;
    
    // Count shipping indicators
    for (const term of LightweightFilterService.SHIPPING_INDICATORS) {
      if (lowerText.includes(term)) {
        shippingTermCount++;
      }
    }
    
    // Count non-shipping indicators (negative score)
    for (const term of LightweightFilterService.NON_SHIPPING_INDICATORS) {
      if (lowerText.includes(term)) {
        nonShippingTermCount++;
      }
    }

    // Additional checks for shipping patterns
    const hasNumbers = /\d{3,}/.test(text); // Large numbers common in shipping
    const hasPorts = /\b[A-Z][a-z]+\b.*?\b[A-Z][a-z]+\b/.test(text); // Port names pattern
    const hasDates = /\d{1,2}[-\/]\d{1,2}/.test(text); // Date patterns
    const hasRates = /\d+\s*(?:t\/day|pdpr|mt)/.test(lowerText); // Rate patterns

    let score = 0;
    
    // Base score from shipping terms
    score += Math.min(shippingTermCount * 0.15, 0.6); // Cap at 0.6
    
    // Penalty for non-shipping terms
    score -= nonShippingTermCount * 0.2;
    
    // Bonus for shipping patterns
    if (hasNumbers) score += 0.1;
    if (hasPorts) score += 0.1;
    if (hasDates) score += 0.1;
    if (hasRates) score += 0.15;
    
    // Bonus for email structure patterns
    if (lowerText.includes('subject:') || lowerText.includes('re:')) score += 0.05;
    
    return Math.max(0, Math.min(1, score));
  }

  private evaluateExtractionQuality(regexResult: RegexExtractionResult): 'excellent' | 'good' | 'poor' | 'insufficient' {
    const confidence = regexResult.confidence;
    const criticalFieldsFound = this.countCriticalFields(regexResult);
    const importantFieldsFound = this.countImportantFields(regexResult);
    
    // Excellent: High confidence + most critical fields + some important fields
    if (confidence >= 0.8 && criticalFieldsFound >= 4 && importantFieldsFound >= 2) {
      return 'excellent';
    }
    
    // Good: Decent confidence + core critical fields + some important fields
    if (confidence >= 0.6 && criticalFieldsFound >= 3 && importantFieldsFound >= 1) {
      return 'good';
    }
    
    // Poor: Some fields found but not comprehensive
    if (confidence >= 0.3 && criticalFieldsFound >= 2) {
      return 'poor';
    }
    
    // Insufficient: Very little extracted
    return 'insufficient';
  }

  private findMissingCriticalFields(regexResult: RegexExtractionResult): string[] {
    const missing: string[] = [];
    const fields = regexResult.extractedFields;
    
    for (const field of LightweightFilterService.CRITICAL_FIELDS) {
      if (!fields[field as keyof typeof fields]) {
        missing.push(field);
      }
    }
    
    return missing;
  }

  private countCriticalFields(regexResult: RegexExtractionResult): number {
    let count = 0;
    const fields = regexResult.extractedFields;
    
    for (const field of LightweightFilterService.CRITICAL_FIELDS) {
      if (fields[field as keyof typeof fields]) {
        count++;
      }
    }
    
    return count;
  }

  private countImportantFields(regexResult: RegexExtractionResult): number {
    let count = 0;
    const fields = regexResult.extractedFields;
    
    for (const field of LightweightFilterService.IMPORTANT_FIELDS) {
      if (fields[field as keyof typeof fields]) {
        count++;
      }
    }
    
    return count;
  }

  private decideLLMUsage(quality: string, missingCritical: string[], regexResult: RegexExtractionResult): { shouldUse: boolean; reason: string } {
    
    // Excellent extraction - no need for LLM
    if (quality === 'excellent') {
      return {
        shouldUse: false,
        reason: 'Excellent regex extraction quality - all critical fields found'
      };
    }
    
    // Good extraction - only use LLM if missing very important fields
    if (quality === 'good') {
      const missingVeryImportant = missingCritical.filter(field => 
        ['commodity', 'quantity'].includes(field)
      );
      
      if (missingVeryImportant.length === 0) {
        return {
          shouldUse: false,
          reason: 'Good regex extraction quality - core fields present'
        };
      } else {
        return {
          shouldUse: true,
          reason: `Missing critical fields: ${missingVeryImportant.join(', ')}`
        };
      }
    }
    
    // Poor extraction - use LLM if it looks promising
    if (quality === 'poor') {
      const hasBasicInfo = regexResult.extractedFields.commodity || regexResult.extractedFields.quantity;
      
      if (hasBasicInfo && missingCritical.length <= 3) {
        return {
          shouldUse: true,
          reason: `Poor regex extraction but recoverable - missing: ${missingCritical.join(', ')}`
        };
      } else {
        return {
          shouldUse: false,
          reason: 'Poor regex extraction with too many missing critical fields'
        };
      }
    }
    
    // Insufficient extraction - use LLM only if we have shipping indicators
    if (regexResult.matchedPatterns.length > 0) {
      return {
        shouldUse: true,
        reason: 'Insufficient regex extraction but shipping content detected'
      };
    } else {
      return {
        shouldUse: false,
        reason: 'Insufficient regex extraction and no clear shipping indicators'
      };
    }
  }

  /**
   * Quick check if email content looks like maritime cargo/vessel inquiry
   */
  isMaritimeContent(text: string): boolean {
    return this.calculateShippingScore(text) >= 0.4;
  }

  /**
   * Get statistics about extraction quality for monitoring
   */
  getExtractionStats(regexResult: RegexExtractionResult): {
    totalFieldsExtracted: number;
    criticalFieldsFound: number;
    criticalFieldsMissing: number;
    patternMatches: number;
    confidence: number;
  } {
    const criticalFound = this.countCriticalFields(regexResult);
    const criticalTotal = LightweightFilterService.CRITICAL_FIELDS.size;
    
    // Count non-null fields
    const totalFields = Object.values(regexResult.extractedFields).filter(value => 
      value !== null && value !== undefined && 
      (typeof value !== 'object' || Object.keys(value).length > 0)
    ).length;

    return {
      totalFieldsExtracted: totalFields,
      criticalFieldsFound: criticalFound,
      criticalFieldsMissing: criticalTotal - criticalFound,
      patternMatches: regexResult.matchedPatterns.length,
      confidence: regexResult.confidence
    };
  }
}