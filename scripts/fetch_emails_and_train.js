const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function fetchEmailsAndTrain() {
  console.log('🔄 Fetching emails from database...');
  
  try {
    // First, let's check what tables exist
    console.log('📋 Checking available tables...');
    
    // Try to get some inbound emails with any classification
    const inboundEmails = await prisma.inboundEmail.findMany({
      select: {
        id: true,
        subject: true,
        raw: true,
        fromAddr: true,
        parsedType: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit to 100 emails for initial training
    }).catch(err => {
      console.log('❌ InboundEmail table not accessible:', err.message);
      return [];
    });

    console.log(`📧 Found ${inboundEmails.length} inbound emails`);

    if (inboundEmails.length === 0) {
      console.log('⚠️  No emails found in database, using synthetic training data');
      await trainWithSyntheticData();
      return;
    }

    // Transform emails into training format
    const trainingData = [];
    
    for (const email of inboundEmails) {
      let label = 'OTHER'; // Default label
      
      // Try to determine label from existing classification or content
      if (email.parsedType) {
        label = email.parsedType;
      } else {
        // Simple rule-based labeling for unlabeled emails
        const text = `${email.subject || ''} ${email.raw || ''}`.toLowerCase();
        
        if (isCargoEmail(text)) {
          label = 'CARGO';
        } else if (isVesselEmail(text)) {
          label = 'VESSEL';
        }
      }
      
      trainingData.push({
        id: email.id,
        subject: email.subject || '',
        body: email.raw || '',
        sender: email.fromAddr || '',
        type: label,
        timestamp: email.createdAt
      });
    }

    console.log(`📊 Prepared ${trainingData.length} training samples`);
    
    // Show distribution
    const distribution = {};
    trainingData.forEach(item => {
      distribution[item.type] = (distribution[item.type] || 0) + 1;
    });
    
    console.log('📈 Data distribution:');
    Object.entries(distribution).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} emails`);
    });

    // Save training data
    const trainingDataPath = path.join(process.cwd(), 'ml', 'collected_training_data.json');
    fs.writeFileSync(trainingDataPath, JSON.stringify(trainingData, null, 2));
    console.log(`💾 Saved training data to ${trainingDataPath}`);

    // Train the model
    console.log('🤖 Training model...');
    await trainModelWithData(trainingData);
    
    // Test the trained model
    console.log('🧪 Testing trained model...');
    await testTrainedModel();

  } catch (error) {
    console.error('❌ Error fetching emails:', error);
    console.log('⚠️  Falling back to synthetic training data');
    await trainWithSyntheticData();
  } finally {
    await prisma.$disconnect();
  }
}

function isCargoEmail(text) {
  const cargoKeywords = [
    'cargo', 'commodity', 'grain', 'coal', 'iron ore', 'wheat', 'steel',
    'looking for vessel', 'seeking vessel', 'need vessel', 'shipment',
    'tonnage required', 'laycan', 'loading port', 'discharge port',
    'mt ', ' tons', 'metric ton'
  ];
  
  return cargoKeywords.some(keyword => text.includes(keyword));
}

function isVesselEmail(text) {
  const vesselKeywords = [
    'vessel', 'ship', 'dwt', 'mv ', 'm/v ', 'open position', 'vessel available',
    'seeking cargo', 'bulk carrier', 'tanker', 'container vessel',
    'charter', 'hire', 'ballast', 'geared', 'cranes'
  ];
  
  return vesselKeywords.some(keyword => text.includes(keyword));
}

async function trainWithSyntheticData() {
  console.log('🎭 Using synthetic training data...');
  
  // Load the existing training model
  const { trainAndSaveModel } = require('../ml/train_model');
  const classifier = trainAndSaveModel();
  
  console.log('✅ Model trained with synthetic data');
}

async function trainModelWithData(trainingData) {
  const { EmailClassifier, extractFeatures } = require('../ml/train_model');
  
  // Create new classifier
  const classifier = new EmailClassifier();
  
  // Train with collected data
  classifier.train(trainingData);
  
  // Save the model
  const modelPath = path.join(process.cwd(), 'ml', 'email_classifier_model.json');
  classifier.save(modelPath);
  
  console.log('✅ Model trained and saved successfully');
  
  // Show training results
  console.log('\n📊 Training Results:');
  console.log(`   Training samples: ${trainingData.length}`);
  console.log(`   Model saved to: ${modelPath}`);
}

async function testTrainedModel() {
  const { EmailClassifier } = require('../ml/train_model');
  
  // Load the trained model
  const classifier = new EmailClassifier();
  const modelPath = path.join(process.cwd(), 'ml', 'email_classifier_model.json');
  
  if (fs.existsSync(modelPath)) {
    classifier.load(modelPath);
  }
  
  // Test samples
  const testEmails = [
    {
      subject: "Bulk cargo inquiry - 50000 MT grain",
      body: "We have 50,000 MT of wheat ready for shipment from US Gulf to Mediterranean. Looking for suitable Panamax vessel.",
      sender: "trader@grain.com"
    },
    {
      subject: "MV Ocean Star - Handymax bulk carrier available",
      body: "Vessel MV Ocean Star, 58,000 DWT Handymax bulk carrier, open Singapore next week. Geared with 4x30T cranes.",
      sender: "ops@shipping.sg"
    },
    {
      subject: "Container booking - 40 TEU electronics",
      body: "Need to book 40 TEU for electronics shipment from Shanghai to Hamburg. FCL cargo ready for loading.",
      sender: "export@electronics.cn"
    }
  ];
  
  console.log('\n🧪 Testing with sample emails:');
  console.log('=' .repeat(60));
  
  testEmails.forEach((email, idx) => {
    const prediction = classifier.predict(email);
    console.log(`\n📧 Test ${idx + 1}: ${email.subject}`);
    console.log(`   Predicted: ${prediction.type}`);
    console.log(`   Confidence: CARGO=${prediction.confidence.CARGO.toFixed(2)}, VESSEL=${prediction.confidence.VESSEL.toFixed(2)}`);
    
    // Show extracted features for debugging
    console.log(`   Cargo Score: ${prediction.features.cargoScore}, Vessel Score: ${prediction.features.vesselScore}`);
  });
  
  console.log('\n✅ Model testing completed');
}

// Run the script
if (require.main === module) {
  fetchEmailsAndTrain()
    .then(() => {
      console.log('\n🎉 Email fetching and training completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  fetchEmailsAndTrain,
  trainWithSyntheticData,
  testTrainedModel
};