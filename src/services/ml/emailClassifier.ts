import fs from 'fs';
import path from 'path';

interface EmailFeatures {
  cargoScore: number;
  vesselScore: number;
  hasTonnage: boolean;
  hasVesselName: boolean;
  isShippingDomain: boolean;
  isCargoDomain: boolean;
  textLength: number;
}


interface PredictionResult {
  type: 'CARGO' | 'VESSEL';
  confidence: {
    CARGO: number;
    VESSEL: number;
  };
  features: EmailFeatures;
}


// Enhanced keyword lists for classification
const cargoKeywords = [
  // Basic cargo terms
  'cargo', 'shipment', 'loading', 'discharge', 'commodity', 'mt', 'metric tons',
  'teu', 'container', 'bulk', 'breakbulk', 'project cargo', 'reefer',
  
  // Commodities
  'grain', 'coal', 'iron ore', 'steel', 'chemical', 'oil', 'lng', 'cement',
  'timber', 'logs', 'rice', 'wheat', 'corn', 'soybeans', 'sugar', 'fertilizer', 
  'bauxite', 'alumina', 'pellets', 'scrap', 'petcoke', 'taconite', 'salt',
  'soya', 'meal', 'beans', 'rapeseed', 'barley', 'sunflower', 'urea',
  
  // Cargo seeking patterns
  'need vessel', 'looking for vessel', 'require vessel', 'seeking vessel',
  'vessel required', 'tonnage required', 'booking', 'inquiry',
  'freight rate', 'laycan', 'load port', 'discharge port', 'destination',
  'fcl', 'lcl', 'cbm', 'cubic meters', 'pallets', 'packages',
  
  // Turkish terms
  'yük', 'kargo', 'emtia', 'ton', 'yükleme', 'boşaltma', 'navlun'
];

const vesselKeywords = [
  // Basic vessel terms
  'vessel', 'ship', 'mv', 'm/v', 'dwt', 'draft', 'loa', 'beam', 'open',
  'available', 'position', 'ballast', 'delivery', 'redelivery',
  
  // Charter terms
  'charter', 'hire', 'tc', 'time charter', 'voyage charter', 'spot',
  'fixture', 'charterer', 'owner', 'rate', 'demurrage', 'despatch',
  
  // Vessel types
  'panamax', 'capesize', 'handymax', 'handysize', 'supramax', 'ultramax',
  'bulk carrier', 'bulker', 'container vessel', 'general cargo', 'multipurpose',
  'tanker', 'chemical tanker', 'product tanker', 'lng carrier', 'lpg carrier',
  'vlcc', 'suezmax', 'aframax', 'vlgc', 'handy tanker',
  
  // Technical specs
  'crane', 'gear', 'geared', 'gearless', 'holds', 'hatches', 'coils',
  'ice class', 'double hull', 'certificates', 'class', 'flag', 'built',
  'imo', 'grt', 'nrt', 'cbft', 'bale', 'grain', 'tpc',
  
  // Availability patterns
  'seeking cargo', 'ship open', 'vessel positioning', 'ballast to',
  'prompt', 'spot tonnage', 'available vessel', 'offering',
  
  // Turkish terms
  'gemi', 'vapur', 'tonaj', 'navlun', 'kiralama', 'yük arama'
];

// High-confidence patterns for quick classification
const cargoPatterns = [
  /looking for.*vessel/i,
  /need.*vessel/i,
  /require.*vessel/i,
  /seeking.*vessel/i,
  /cargo.*available/i,
  /\d+\s*mt.*cargo/i,
  /\d+\s*tons.*cargo/i,
  /laycan.*\d/i,
  /load.*port/i
];

const vesselPatterns = [
  /vessel.*open/i,
  /vessel.*available/i,
  /ship.*available/i,
  /mv\s+\w+.*open/i,
  /\d+\s*dwt.*available/i,
  /seeking.*cargo/i,
  /ballast.*to/i,
  /open.*position/i,
  /prompt.*delivery/i
];

export class EmailClassifier {
  private modelPath: string;

  constructor() {
    this.modelPath = path.join(process.cwd(), 'ml', 'email_classifier_model.json');
    this.loadModel();
  }

  private extractFeatures(email: { subject?: string; body?: string; sender?: string }): EmailFeatures {
    const text = `${email.subject || ''} ${email.body || ''}`.toLowerCase();
    const sender = (email.sender || '').toLowerCase();

    // Count keyword occurrences
    const cargoScore = cargoKeywords.reduce((score, keyword) => {
      return score + (text.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);

    const vesselScore = vesselKeywords.reduce((score, keyword) => {
      return score + (text.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);

    // Check for tonnage patterns
    const hasTonnage = /\d+[\s,]*(?:mt|tons?|dwt|teu|cbm)/i.test(text);

    // Check for vessel name patterns
    const hasVesselName = /m\/?v\s+[\w\s]+/i.test(text);

    // Check sender domain
    const isShippingDomain = ['shipping', 'maritime', 'vessel', 'fleet', 'tanker', 'bulk']
      .some(domain => sender.includes(domain));
    const isCargoDomain = ['cargo', 'logistics', 'export', 'import', 'trade', 'commodity']
      .some(domain => sender.includes(domain));

    return {
      cargoScore,
      vesselScore,
      hasTonnage,
      hasVesselName,
      isShippingDomain,
      isCargoDomain,
      textLength: text.length
    };
  }

  public predict(email: { subject?: string; body?: string; sender?: string }): PredictionResult {
    const features = this.extractFeatures(email);
    const text = `${email.subject || ''} ${email.body || ''}`;

    // Initialize scores
    let cargoScore = 0;
    let vesselScore = 0;

    // Step 1: High-confidence pattern matching (immediate classification)
    for (const pattern of cargoPatterns) {
      if (pattern.test(text)) {
        cargoScore += 0.4;
        break; // One strong pattern is enough
      }
    }

    for (const pattern of vesselPatterns) {
      if (pattern.test(text)) {
        vesselScore += 0.4;
        break;
      }
    }

    // Step 2: Keyword scoring with weights
    const maxKeywordScore = Math.max(features.cargoScore, features.vesselScore);
    const keywordRatio = maxKeywordScore > 0 ? Math.min(features.cargoScore, features.vesselScore) / maxKeywordScore : 1;
    
    if (features.cargoScore > features.vesselScore) {
      cargoScore += 0.3 * (1 + (1 - keywordRatio)); // Bonus for clear keyword dominance
    } else if (features.vesselScore > features.cargoScore) {
      vesselScore += 0.3 * (1 + (1 - keywordRatio));
    } else if (features.cargoScore > 0) {
      // Equal keyword counts - slight preference to cargo
      cargoScore += 0.15;
      vesselScore += 0.10;
    }

    // Step 3: Context and structural features
    if (features.hasVesselName) {
      vesselScore += 0.25;
    }

    if (features.hasTonnage) {
      // Tonnage can indicate either, but context matters
      if (text.toLowerCase().includes('available') || text.toLowerCase().includes('open')) {
        vesselScore += 0.15; // "35,000 DWT available"
      } else {
        cargoScore += 0.15; // "35,000 MT cargo"
      }
    }

    // Step 4: Domain analysis
    if (features.isCargoDomain) {
      cargoScore += 0.2;
    }
    if (features.isShippingDomain) {
      vesselScore += 0.2;
    }

    // Step 5: Advanced pattern analysis
    const advancedCargoPatterns = [
      /\d+\s*(mt|tons?)\s*(of\s*)?[\w\s]*(wheat|grain|coal|iron|steel|cargo)/i,
      /laycan\s*\d/i,
      /load\s*(port|at)/i,
      /discharge\s*(port|at)/i,
      /(cif|fob|cfr)\s*\$/i,
      /booking/i
    ];

    const advancedVesselPatterns = [
      /\b\d+\s*dwt\b.*\b(open|available|ballast)\b/i,
      /\b(mv|m\/v)\s+\w+.*\b(open|available)\b/i,
      /charter\s*(rate|hire)/i,
      /time\s*charter/i,
      /voyage\s*charter/i,
      /ballast\s*to/i,
      /prompt\s*(delivery|available)/i
    ];

    for (const pattern of advancedCargoPatterns) {
      if (pattern.test(text)) {
        cargoScore += 0.1;
      }
    }

    for (const pattern of advancedVesselPatterns) {
      if (pattern.test(text)) {
        vesselScore += 0.1;
      }
    }

    // Step 6: Length and complexity bonus (longer emails often have more context)
    if (features.textLength > 200) {
      const lengthBonus = Math.min(0.1, features.textLength / 2000);
      if (cargoScore > vesselScore) {
        cargoScore += lengthBonus;
      } else if (vesselScore > cargoScore) {
        vesselScore += lengthBonus;
      }
    }

    // Normalize and apply confidence adjustments
    const totalScore = cargoScore + vesselScore;
    let cargoConfidence, vesselConfidence;
    
    if (totalScore > 0) {
      cargoConfidence = cargoScore / totalScore;
      vesselConfidence = vesselScore / totalScore;
    } else {
      // No clear signals - default to slight cargo preference
      cargoConfidence = 0.55;
      vesselConfidence = 0.45;
    }

    // Apply confidence boost for clear classifications
    const confidenceDifference = Math.abs(cargoConfidence - vesselConfidence);
    if (confidenceDifference > 0.3) {
      const boost = Math.min(0.1, (confidenceDifference - 0.3) * 0.5);
      if (cargoConfidence > vesselConfidence) {
        cargoConfidence = Math.min(0.95, cargoConfidence + boost);
        vesselConfidence = 1 - cargoConfidence;
      } else {
        vesselConfidence = Math.min(0.95, vesselConfidence + boost);
        cargoConfidence = 1 - vesselConfidence;
      }
    }

    return {
      type: cargoConfidence > vesselConfidence ? 'CARGO' : 'VESSEL',
      confidence: {
        CARGO: cargoConfidence,
        VESSEL: vesselConfidence
      },
      features
    };
  }

  private loadModel(): void {
    try {
      if (fs.existsSync(this.modelPath)) {
        console.log(`Email classifier model loaded from ${this.modelPath}`);
      } else {
        console.log('No saved model found, using rule-based classification');
      }
    } catch (error) {
      console.error('Error loading model:', error);
      console.log('Falling back to rule-based classification');
    }
  }

  public classifyEmail(subject: string, body: string, sender: string): { type: 'CARGO' | 'VESSEL'; confidence: number } {
    const prediction = this.predict({ subject, body, sender });
    
    return {
      type: prediction.type,
      confidence: Math.max(prediction.confidence.CARGO, prediction.confidence.VESSEL)
    };
  }
}

// Singleton instance
let classifierInstance: EmailClassifier | null = null;

export function getEmailClassifier(): EmailClassifier {
  if (!classifierInstance) {
    classifierInstance = new EmailClassifier();
  }
  return classifierInstance;
}