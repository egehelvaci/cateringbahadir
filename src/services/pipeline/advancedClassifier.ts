import { logger } from '../../utils/logger';

interface TFIDFVector {
  [term: string]: number;
}

interface ClassificationResult {
  label: 'CARGO' | 'VESSEL' | 'OTHER';
  confidence: number;
  probabilities: {
    CARGO: number;
    VESSEL: number;
    OTHER: number;
  };
  features: TFIDFVector;
}

export class AdvancedEmailClassifier {
  private vocabulary: Set<string> = new Set();
  private idfScores: Map<string, number> = new Map();
  private classVectors: Map<string, TFIDFVector> = new Map();
  private trainingData: Array<{ text: string; label: string }> = [];
  private minConfidenceThreshold = 0.7;
  
  constructor() {
    this.initializeWithBaseData();
  }

  /**
   * Initialize with base training data
   */
  private initializeWithBaseData() {
    // Base training examples
    const baseData = [
      // CARGO examples
      { text: 'steel billets 21400 mt loading sohar discharge odessa laycan september', label: 'CARGO' },
      { text: 'grain cargo 50000 tons wheat from brazil to mediterranean ports', label: 'CARGO' },
      { text: 'coal shipment 75000 mt indonesia to china capesize vessel required', label: 'CARGO' },
      { text: 'container booking 40 teu electronics shanghai to hamburg', label: 'CARGO' },
      { text: 'bulk cargo iron ore 170000 mt australia to china', label: 'CARGO' },
      
      // VESSEL examples
      { text: 'mv pacific dream handymax 58000 dwt open singapore grain coal', label: 'VESSEL' },
      { text: 'panamax vessel 75000 dwt available japan 5 holds geared cranes', label: 'VESSEL' },
      { text: 'container vessel 8500 teu mediterranean charter available', label: 'VESSEL' },
      { text: 'bulk carrier capesize 180000 dwt open brazil iron ore coal', label: 'VESSEL' },
      { text: 'tanker 50000 dwt double hull spot charter persian gulf', label: 'VESSEL' },
      
      // OTHER examples
      { text: 'market report freight rates increasing asia europe trade', label: 'OTHER' },
      { text: 'bunker prices singapore 380 cst fuel oil update', label: 'OTHER' },
      { text: 'port congestion update shanghai delays expected', label: 'OTHER' }
    ];
    
    this.trainingData = baseData;
    this.train();
  }

  /**
   * Train the classifier with TF-IDF
   */
  public train(additionalData?: Array<{ text: string; label: string }>) {
    if (additionalData) {
      this.trainingData = [...this.trainingData, ...additionalData];
    }
    
    // Step 1: Build vocabulary
    this.buildVocabulary();
    
    // Step 2: Calculate IDF scores
    this.calculateIDF();
    
    // Step 3: Create TF-IDF vectors for each class
    this.createClassVectors();
    
    logger.info(`Classifier trained with ${this.trainingData.length} samples, vocabulary size: ${this.vocabulary.size}`);
  }

  private buildVocabulary() {
    this.vocabulary.clear();
    
    this.trainingData.forEach(sample => {
      const tokens = this.tokenize(sample.text);
      tokens.forEach(token => this.vocabulary.add(token));
    });
  }

  private calculateIDF() {
    this.idfScores.clear();
    const totalDocs = this.trainingData.length;
    
    this.vocabulary.forEach(term => {
      const docsWithTerm = this.trainingData.filter(sample => 
        this.tokenize(sample.text).includes(term)
      ).length;
      
      const idf = Math.log((totalDocs + 1) / (docsWithTerm + 1)) + 1;
      this.idfScores.set(term, idf);
    });
  }

  private createClassVectors() {
    this.classVectors.clear();
    
    const classes = ['CARGO', 'VESSEL', 'OTHER'];
    
    classes.forEach(className => {
      const classSamples = this.trainingData.filter(s => s.label === className);
      const classVector: TFIDFVector = {};
      
      if (classSamples.length === 0) return;
      
      // Aggregate TF-IDF scores for the class
      this.vocabulary.forEach(term => {
        let totalTFIDF = 0;
        
        classSamples.forEach(sample => {
          const tokens = this.tokenize(sample.text);
          const tf = tokens.filter(t => t === term).length / tokens.length;
          const idf = this.idfScores.get(term) || 0;
          totalTFIDF += tf * idf;
        });
        
        classVector[term] = totalTFIDF / classSamples.length;
      });
      
      this.classVectors.set(className, classVector);
    });
  }

  /**
   * Classify an email
   */
  public classify(text: string): ClassificationResult {
    const tokens = this.tokenize(text);
    const vector = this.createTFIDFVector(tokens);
    
    // Calculate similarity with each class vector
    const similarities = new Map<string, number>();
    let maxSimilarity = 0;
    let bestClass = 'OTHER';
    
    ['CARGO', 'VESSEL', 'OTHER'].forEach(className => {
      const classVector = this.classVectors.get(className);
      if (!classVector) {
        similarities.set(className, 0);
        return;
      }
      
      const similarity = this.cosineSimilarity(vector, classVector);
      similarities.set(className, similarity);
      
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestClass = className;
      }
    });
    
    // Normalize similarities to probabilities
    const totalSim = Array.from(similarities.values()).reduce((a, b) => a + b, 0) || 1;
    const probabilities = {
      CARGO: (similarities.get('CARGO') || 0) / totalSim,
      VESSEL: (similarities.get('VESSEL') || 0) / totalSim,
      OTHER: (similarities.get('OTHER') || 0) / totalSim
    };
    
    // Apply rule-based adjustments
    const adjustedResult = this.applyRuleBasedAdjustments(text, bestClass, probabilities);
    
    return {
      label: adjustedResult.label as 'CARGO' | 'VESSEL' | 'OTHER',
      confidence: adjustedResult.confidence,
      probabilities: adjustedResult.probabilities,
      features: vector
    };
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }

  private createTFIDFVector(tokens: string[]): TFIDFVector {
    const vector: TFIDFVector = {};
    const tokenCounts = new Map<string, number>();
    
    // Count tokens
    tokens.forEach(token => {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    });
    
    // Calculate TF-IDF
    tokenCounts.forEach((count, token) => {
      const tf = count / tokens.length;
      const idf = this.idfScores.get(token) || 1;
      vector[token] = tf * idf;
    });
    
    return vector;
  }

  private cosineSimilarity(vec1: TFIDFVector, vec2: TFIDFVector): number {
    const terms = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    terms.forEach(term => {
      const v1 = vec1[term] || 0;
      const v2 = vec2[term] || 0;
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    });
    
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  private applyRuleBasedAdjustments(
    text: string,
    predictedClass: string,
    probabilities: { CARGO: number; VESSEL: number; OTHER: number }
  ): {
    label: string;
    confidence: number;
    probabilities: { CARGO: number; VESSEL: number; OTHER: number };
  } {
    const lowerText = text.toLowerCase();
    let adjustedClass = predictedClass;
    let adjustedProbs = { ...probabilities };
    
    // Strong cargo indicators
    const strongCargoPatterns = [
      /\d+\s*(?:mt|tons?|tonnes?)\s+(?:of\s+)?(?:cargo|commodity|grain|coal|iron|steel)/i,
      /looking for (?:vessel|ship|tonnage)/i,
      /cargo available/i,
      /seeking vessel/i,
      /laycan\s*:?\s*\d/i
    ];
    
    // Strong vessel indicators
    const strongVesselPatterns = [
      /(?:mv|m\/v|ss)\s+\w+/i,
      /\d+\s*dwt\s+(?:vessel|ship|bulk carrier|tanker)/i,
      /vessel (?:available|open)/i,
      /seeking cargo/i,
      /(?:spot|time) charter/i
    ];
    
    // Check strong patterns
    const hasStrongCargo = strongCargoPatterns.some(p => p.test(lowerText));
    const hasStrongVessel = strongVesselPatterns.some(p => p.test(lowerText));
    
    if (hasStrongCargo && !hasStrongVessel) {
      adjustedClass = 'CARGO';
      adjustedProbs.CARGO = Math.min(adjustedProbs.CARGO * 1.5, 0.95);
      adjustedProbs.VESSEL *= 0.7;
      adjustedProbs.OTHER *= 0.7;
    } else if (hasStrongVessel && !hasStrongCargo) {
      adjustedClass = 'VESSEL';
      adjustedProbs.VESSEL = Math.min(adjustedProbs.VESSEL * 1.5, 0.95);
      adjustedProbs.CARGO *= 0.7;
      adjustedProbs.OTHER *= 0.7;
    }
    
    // Normalize probabilities
    const total = adjustedProbs.CARGO + adjustedProbs.VESSEL + adjustedProbs.OTHER;
    if (total > 0) {
      adjustedProbs.CARGO /= total;
      adjustedProbs.VESSEL /= total;
      adjustedProbs.OTHER /= total;
    }
    
    // Calculate confidence
    const maxProb = Math.max(adjustedProbs.CARGO, adjustedProbs.VESSEL, adjustedProbs.OTHER);
    
    return {
      label: adjustedClass,
      confidence: maxProb,
      probabilities: adjustedProbs
    };
  }

  /**
   * Add feedback to improve the classifier
   */
  public addFeedback(text: string, correctLabel: 'CARGO' | 'VESSEL' | 'OTHER') {
    this.trainingData.push({ text, label: correctLabel });
    
    // Retrain if we have enough new samples
    if (this.trainingData.length % 10 === 0) {
      this.train();
      logger.info(`Classifier retrained with feedback, total samples: ${this.trainingData.length}`);
    }
  }

  /**
   * Check if confidence is below threshold
   */
  public needsHumanReview(confidence: number): boolean {
    return confidence < this.minConfidenceThreshold;
  }

  /**
   * Export model for persistence
   */
  public exportModel(): string {
    return JSON.stringify({
      vocabulary: Array.from(this.vocabulary),
      idfScores: Array.from(this.idfScores.entries()),
      classVectors: Array.from(this.classVectors.entries()),
      trainingData: this.trainingData
    });
  }

  /**
   * Import model from persistence
   */
  public importModel(modelJson: string) {
    const model = JSON.parse(modelJson);
    this.vocabulary = new Set(model.vocabulary);
    this.idfScores = new Map(model.idfScores);
    this.classVectors = new Map(model.classVectors);
    this.trainingData = model.trainingData;
  }
}