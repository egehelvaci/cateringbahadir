const { AdvancedEmailClassifier } = require('../dist/services/pipeline/advancedClassifier');
const fs = require('fs');
const path = require('path');

async function testAdvancedClassifier() {
  console.log('🤖 Testing Advanced TF-IDF Classifier...\n');

  try {
    // Load training data
    const trainingDataPath = path.join(process.cwd(), 'ml', 'collected_training_data.json');
    let trainingData = [];
    
    if (fs.existsSync(trainingDataPath)) {
      const rawData = JSON.parse(fs.readFileSync(trainingDataPath, 'utf8'));
      
      // Transform to classifier format
      trainingData = rawData.map(email => ({
        text: `${email.subject || ''} ${email.body || ''}`,
        label: email.type === 'OTHER' ? 'OTHER' : email.type
      }));
      
      console.log(`📚 Loaded ${trainingData.length} training samples from database`);
    } else {
      console.log('⚠️  No training data found, using base dataset');
    }

    // Initialize classifier
    const classifier = new AdvancedEmailClassifier();
    
    // Train with additional data if available
    if (trainingData.length > 0) {
      classifier.train(trainingData);
      console.log('✅ Classifier retrained with real data');
    }

    // Test emails
    const testEmails = [
      {
        subject: "Steel cargo inquiry - 25000 MT steel billets",
        body: "We have steel billets 25000 MT ready for shipment from Sohar to Rotterdam. Laycan 15-20 September. Looking for suitable Handymax vessel with geared cranes.",
        expected: "CARGO"
      },
      {
        subject: "MV Ocean Pioneer - Handymax available", 
        body: "Vessel MV Ocean Pioneer, 55000 DWT Handymax bulk carrier, open Singapore from 10 September. Geared with 4x30T cranes. Ready for grain/steel cargoes.",
        expected: "VESSEL"
      },
      {
        subject: "Container booking - 40 TEU electronics",
        body: "Need to book 40 TEU containers for electronics shipment from Shanghai to Hamburg. FCL cargo ready for loading next week.",
        expected: "CARGO"
      },
      {
        subject: "Panamax vessel seeking cargo",
        body: "Panamax bulk carrier 75000 DWT available for charter. Currently Japan area. Next open 25 September for grain/coal voyages.",
        expected: "VESSEL"
      },
      {
        subject: "Iron ore shipment - 100000 MT",
        body: "Iron ore fines 100000 MT from Australia to China. Capesize vessel required. Laycan 1-10 October.",
        expected: "CARGO"
      },
      {
        subject: "Market report - Freight rates",
        body: "Weekly freight market report. Dry bulk rates increasing on Pacific routes. Capesize rates up 15% this week.",
        expected: "OTHER"
      }
    ];

    console.log('\n🧪 Testing Advanced Classifier:');
    console.log('=' .repeat(80));

    let correct = 0;
    let total = testEmails.length;

    testEmails.forEach((email, idx) => {
      const result = classifier.classify(email.subject + ' ' + email.body);
      const isCorrect = result.label === email.expected;
      
      if (isCorrect) correct++;
      
      console.log(`\n📧 Test ${idx + 1}: ${email.subject}`);
      console.log(`   Expected: ${email.expected}`);
      console.log(`   Predicted: ${result.label} ${isCorrect ? '✅' : '❌'}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Probabilities: CARGO=${(result.probabilities.CARGO * 100).toFixed(1)}%, VESSEL=${(result.probabilities.VESSEL * 100).toFixed(1)}%, OTHER=${(result.probabilities.OTHER * 100).toFixed(1)}%`);
      
      if (!isCorrect) {
        console.log(`   🔍 Reason: Misclassification detected`);
      }
    });

    const accuracy = (correct / total * 100).toFixed(1);
    console.log(`\n📊 Results:`);
    console.log(`   Correct: ${correct}/${total}`);
    console.log(`   Accuracy: ${accuracy}%`);

    // Test confidence threshold
    console.log('\n🎯 Confidence Threshold Analysis:');
    console.log('-'.repeat(50));
    
    const thresholds = [0.5, 0.6, 0.7, 0.8, 0.9];
    
    thresholds.forEach(threshold => {
      const needsReview = testEmails.filter(email => {
        const result = classifier.classify(email.subject + ' ' + email.body);
        return result.confidence < threshold;
      }).length;
      
      console.log(`   Threshold ${threshold}: ${needsReview}/${total} emails would need human review`);
    });

    // Show feature importance (top TF-IDF terms)
    console.log('\n📈 Sample Feature Analysis:');
    console.log('-'.repeat(50));
    
    const sampleResult = classifier.classify(testEmails[0].subject + ' ' + testEmails[0].body);
    const topFeatures = Object.entries(sampleResult.features)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    console.log('   Top TF-IDF features for first test email:');
    topFeatures.forEach(([term, score], idx) => {
      console.log(`   ${idx + 1}. "${term}": ${score.toFixed(3)}`);
    });

    console.log('\n✅ Advanced classifier testing completed!');
    
    return {
      accuracy: parseFloat(accuracy),
      correct,
      total,
      testResults: testEmails.map((email, idx) => ({
        email: email.subject,
        expected: email.expected,
        predicted: classifier.classify(email.subject + ' ' + email.body).label,
        confidence: classifier.classify(email.subject + ' ' + email.body).confidence
      }))
    };

  } catch (error) {
    console.error('❌ Error testing advanced classifier:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  testAdvancedClassifier()
    .then(results => {
      console.log('\n🎉 All tests completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Testing failed:', error);
      process.exit(1);
    });
}

module.exports = { testAdvancedClassifier };