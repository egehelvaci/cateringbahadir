const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function collectEmailsForTraining() {
  try {
    // Fetch emails from database
    console.log('Fetching emails from database...');
    
    const emails = await prisma.inboundEmail.findMany({
      where: {
        parsedType: {
          not: null
        }
      },
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
      take: 1000 // Get up to 1000 emails for training
    });

    console.log(`Found ${emails.length} classified emails`);

    // Transform emails into training format
    const trainingData = emails.map(email => ({
      id: email.id,
      subject: email.subject || '',
      body: email.raw || '',
      sender: email.fromAddr || '',
      type: email.parsedType,
      timestamp: email.createdAt
    }));

    // Save to file for training
    const outputPath = path.join(__dirname, 'collected_training_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(trainingData, null, 2));
    
    console.log(`Saved ${trainingData.length} emails to ${outputPath}`);

    // Show distribution
    const cargoCount = trainingData.filter(e => e.type === 'CARGO').length;
    const vesselCount = trainingData.filter(e => e.type === 'VESSEL').length;
    
    console.log('\nData distribution:');
    console.log(`CARGO: ${cargoCount} emails`);
    console.log(`VESSEL: ${vesselCount} emails`);

    // If we have enough data, retrain the model
    if (trainingData.length >= 20) {
      console.log('\nRetraining model with collected data...');
      await retrainModel(trainingData);
    } else {
      console.log('\nNot enough data for retraining (need at least 20 emails)');
    }

  } catch (error) {
    console.error('Error collecting emails:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function retrainModel(trainingData) {
  const { EmailClassifier, extractFeatures } = require('./train_model');
  
  // Create new classifier instance
  const classifier = new EmailClassifier();
  
  // Train with collected data
  classifier.train(trainingData);
  
  // Save updated model
  const modelPath = path.join(__dirname, 'email_classifier_model.json');
  classifier.save(modelPath);
  
  console.log('Model retrained and saved successfully');
  
  // Test with a few samples
  console.log('\nTesting retrained model:');
  const testSamples = trainingData.slice(0, 3);
  
  testSamples.forEach((email, idx) => {
    const prediction = classifier.predict(email);
    console.log(`\nTest ${idx + 1}: ${email.subject.substring(0, 50)}...`);
    console.log(`Actual: ${email.type}, Predicted: ${prediction.type}`);
    console.log(`Confidence: CARGO=${prediction.confidence.CARGO.toFixed(2)}, VESSEL=${prediction.confidence.VESSEL.toFixed(2)}`);
  });
}

// Run the script
collectEmailsForTraining();