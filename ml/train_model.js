const fs = require('fs');
const path = require('path');

// Training data
const trainingData = [
    // CARGO emails
    {
        subject: "New Cargo Inquiry - 500 MT Steel Pipes",
        body: "We have a cargo of 500 metric tons of steel pipes ready for shipment from Shanghai to Rotterdam. Looking for suitable vessel.",
        sender: "cargo@logistics.com",
        type: "CARGO"
    },
    {
        subject: "Urgent: Container booking needed",
        body: "Need to book 20 TEU containers for electronics shipment. Origin: Shenzhen, Destination: Hamburg",
        sender: "shipper@export.cn",
        type: "CARGO"
    },
    {
        subject: "Bulk cargo - Grain shipment",
        body: "50,000 MT wheat cargo available ex Brazil ports. Looking for Panamax vessel for voyage to Mediterranean",
        sender: "graintrader@agri.br",
        type: "CARGO"
    },
    {
        subject: "Project cargo inquiry",
        body: "Heavy lift cargo consisting of turbines and generators. Total weight 200 MT. Need specialized vessel with cranes",
        sender: "project@energy.de",
        type: "CARGO"
    },
    {
        subject: "Chemical tanker cargo",
        body: "5000 MT caustic soda solution for shipment. IMO Class 8. Need chemical tanker with stainless steel tanks",
        sender: "chemical@trade.com",
        type: "CARGO"
    },
    {
        subject: "Coal shipment inquiry",
        body: "Steam coal cargo 75,000 MT available at Indonesian ports. Looking for Capesize vessel",
        sender: "coal@mining.id",
        type: "CARGO"
    },
    {
        subject: "Reefer cargo - Frozen food",
        body: "1000 MT frozen chicken cargo. Temperature requirement -18C. Need reefer vessel or containers",
        sender: "food@export.th",
        type: "CARGO"
    },
    {
        subject: "Iron ore cargo tender",
        body: "Iron ore fines 170,000 MT from Australia to China. Capesize vessel required",
        sender: "ironore@resources.au",
        type: "CARGO"
    },
    
    // VESSEL emails
    {
        subject: "MV Pacific Dream - Open for cargo",
        body: "Vessel MV Pacific Dream, Handymax bulk carrier, DWT 58,000 MT, open at Singapore from next week. Ready for grain/coal cargoes",
        sender: "operations@shipping.sg",
        type: "VESSEL"
    },
    {
        subject: "Container vessel available",
        body: "Container vessel 8,500 TEU capacity available for charter. Current position Mediterranean. Can accommodate reefer containers",
        sender: "chartering@maritime.gr",
        type: "VESSEL"
    },
    {
        subject: "Tanker vessel for spot charter",
        body: "Product tanker, 50,000 DWT, double hull, available for spot charter. All certificates valid. Position: Persian Gulf",
        sender: "tanker@fleet.ae",
        type: "VESSEL"
    },
    {
        subject: "Bulk carrier open position",
        body: "Panamax bulk carrier, 75,000 DWT, 5 holds/5 hatches, geared with 4x30T cranes. Open Japan next month",
        sender: "bulkops@vessel.jp",
        type: "VESSEL"
    },
    {
        subject: "Chemical tanker available",
        body: "Chemical tanker 20,000 DWT, stainless steel tanks, IMO II/III. Valid certificates. Open Houston area",
        sender: "chemical@tankers.us",
        type: "VESSEL"
    },
    {
        subject: "VLCC for time charter",
        body: "VLCC 300,000 DWT available for 1-year time charter. Double hull, 15 years old. All surveys passed",
        sender: "vlcc@supertanker.no",
        type: "VESSEL"
    },
    {
        subject: "General cargo vessel",
        body: "General cargo vessel 12,000 DWT with box-shaped holds. Good for project cargo. Open Mediterranean",
        sender: "general@cargo.it",
        type: "VESSEL"
    }
];

// Keyword lists for classification
const cargoKeywords = [
    'cargo', 'shipment', 'loading', 'discharge', 'commodity', 'mt', 'metric tons',
    'teu', 'container', 'bulk', 'breakbulk', 'project cargo', 'reefer',
    'grain', 'coal', 'iron ore', 'steel', 'chemical', 'oil', 'lng', 'cement',
    'timber', 'logs', 'rice', 'wheat', 'sugar', 'fertilizer', 'bauxite',
    'need vessel', 'looking for vessel', 'require vessel', 'booking',
    'freight rate', 'laycan', 'load port', 'discharge port', 'destination'
];

const vesselKeywords = [
    'vessel', 'ship', 'mv', 'm/v', 'dwt', 'draft', 'loa', 'beam', 'open',
    'available', 'position', 'charter', 'hire', 'tc', 'time charter',
    'voyage charter', 'spot', 'panamax', 'capesize', 'handymax', 'handysize',
    'bulk carrier', 'container vessel', 'general cargo', 'multipurpose',
    'tanker', 'chemical tanker', 'product tanker', 'lng carrier',
    'crane', 'gear', 'geared', 'gearless', 'holds', 'hatches',
    'ice class', 'double hull', 'certificates', 'class', 'flag'
];

// Feature extraction function
function extractFeatures(email) {
    const text = `${email.subject || ''} ${email.body || ''}`.toLowerCase();
    const sender = (email.sender || '').toLowerCase();
    
    // Count keyword occurrences
    const cargoScore = cargoKeywords.reduce((score, keyword) => {
        return score + (text.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);
    
    const vesselScore = vesselKeywords.reduce((score, keyword) => {
        return score + (text.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);
    
    // Check for tonnage patterns (e.g., "500 MT", "50,000 DWT")
    const hasTonnage = /\d+[\s,]*(?:mt|tons?|dwt|teu|cbm)/i.test(text);
    
    // Check for vessel name patterns (e.g., "MV Pacific Dream")
    const hasVesselName = /m\/?v\s+[\w\s]+/i.test(text);
    
    // Check sender domain
    const isShippingDomain = ['shipping', 'maritime', 'vessel', 'fleet', 'tanker', 'bulk']
        .some(domain => sender.includes(domain));
    const isCargoomain = ['cargo', 'logistics', 'export', 'import', 'trade', 'commodity']
        .some(domain => sender.includes(domain));
    
    return {
        cargoScore,
        vesselScore,
        hasTonnage,
        hasVesselName,
        isShippingDomain,
        isCargoomain,
        textLength: text.length
    };
}

// Simple rule-based classifier
class EmailClassifier {
    constructor() {
        this.threshold = 0.5;
    }
    
    train(data) {
        // Calculate average features for each class
        const cargoEmails = data.filter(e => e.type === 'CARGO');
        const vesselEmails = data.filter(e => e.type === 'VESSEL');
        
        this.cargoProfile = this.calculateProfile(cargoEmails);
        this.vesselProfile = this.calculateProfile(vesselEmails);
        
        console.log('Model trained successfully');
        console.log('Cargo profile:', this.cargoProfile);
        console.log('Vessel profile:', this.vesselProfile);
    }
    
    calculateProfile(emails) {
        const features = emails.map(e => extractFeatures(e));
        const profile = {};
        
        if (features.length === 0) return profile;
        
        // Calculate average for each feature
        profile.avgCargoScore = features.reduce((sum, f) => sum + f.cargoScore, 0) / features.length;
        profile.avgVesselScore = features.reduce((sum, f) => sum + f.vesselScore, 0) / features.length;
        profile.hasTonnageRate = features.filter(f => f.hasTonnage).length / features.length;
        profile.hasVesselNameRate = features.filter(f => f.hasVesselName).length / features.length;
        
        return profile;
    }
    
    predict(email) {
        const features = extractFeatures(email);
        
        // Calculate similarity scores
        let cargoSimilarity = 0;
        let vesselSimilarity = 0;
        
        // Weight cargo keywords more for cargo classification
        if (features.cargoScore > features.vesselScore) {
            cargoSimilarity += 0.6;
        } else if (features.vesselScore > features.cargoScore) {
            vesselSimilarity += 0.6;
        }
        
        // Check specific patterns
        if (features.hasVesselName) {
            vesselSimilarity += 0.3;
        }
        
        if (features.isCargoomain) {
            cargoSimilarity += 0.2;
        }
        
        if (features.isShippingDomain) {
            vesselSimilarity += 0.2;
        }
        
        // Normalize scores
        const totalScore = cargoSimilarity + vesselSimilarity;
        if (totalScore > 0) {
            cargoSimilarity /= totalScore;
            vesselSimilarity /= totalScore;
        }
        
        return {
            type: cargoSimilarity > vesselSimilarity ? 'CARGO' : 'VESSEL',
            confidence: {
                CARGO: cargoSimilarity,
                VESSEL: vesselSimilarity
            },
            features
        };
    }
    
    save(filepath) {
        const model = {
            cargoProfile: this.cargoProfile,
            vesselProfile: this.vesselProfile,
            threshold: this.threshold,
            version: '1.0.0'
        };
        
        fs.writeFileSync(filepath, JSON.stringify(model, null, 2));
        console.log(`Model saved to ${filepath}`);
    }
    
    load(filepath) {
        const model = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        this.cargoProfile = model.cargoProfile;
        this.vesselProfile = model.vesselProfile;
        this.threshold = model.threshold;
        console.log(`Model loaded from ${filepath}`);
    }
}

// Train and save the model
function trainAndSaveModel() {
    const classifier = new EmailClassifier();
    
    // Train the model
    classifier.train(trainingData);
    
    // Test the model
    console.log('\nTesting the model:');
    console.log('=' .repeat(50));
    
    const testEmails = [
        {
            subject: "Steel coils 5000 MT ready for shipment",
            body: "We have steel coils ready at Shanghai port. Need vessel for Japan",
            sender: "steel@export.cn"
        },
        {
            subject: "MV Star Eagle open position",
            body: "Bulk carrier 55,000 DWT open Singapore next week",
            sender: "ops@bulkship.sg"
        }
    ];
    
    testEmails.forEach((email, idx) => {
        const prediction = classifier.predict(email);
        console.log(`\nTest ${idx + 1}: ${email.subject}`);
        console.log(`Prediction: ${prediction.type}`);
        console.log(`Confidence: CARGO=${prediction.confidence.CARGO.toFixed(2)}, VESSEL=${prediction.confidence.VESSEL.toFixed(2)}`);
    });
    
    // Save the model
    const modelPath = path.join(__dirname, 'email_classifier_model.json');
    classifier.save(modelPath);
    
    // Save training data for reference
    const dataPath = path.join(__dirname, 'training_data.json');
    fs.writeFileSync(dataPath, JSON.stringify(trainingData, null, 2));
    console.log(`Training data saved to ${dataPath}`);
    
    return classifier;
}

// Export for use in other modules
module.exports = {
    EmailClassifier,
    extractFeatures,
    trainAndSaveModel
};

// Run if called directly
if (require.main === module) {
    trainAndSaveModel();
}