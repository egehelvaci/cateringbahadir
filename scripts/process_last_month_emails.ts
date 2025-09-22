import { EmailProcessor } from '../src/services/pipeline/emailProcessor';

async function processLastMonthEmails() {
  console.log('🚀 Starting email processing pipeline...\n');
  
  try {
    const processor = new EmailProcessor();
    
    // Get current statistics
    console.log('📊 Current Statistics:');
    const statsBefore = await processor.getProcessingStats();
    console.log(`   Total Emails: ${statsBefore.totalEmails}`);
    console.log(`   Processed: ${statsBefore.processedEmails}`);
    console.log(`   Cargo Records: ${statsBefore.cargoCount}`);
    console.log(`   Vessel Records: ${statsBefore.vesselCount}`);
    console.log(`   Processing Rate: ${statsBefore.processingRate.toFixed(1)}%\n`);
    
    // Process all emails from last month
    console.log('🔄 Processing emails from last month...\n');
    const result = await processor.processAllEmails();
    
    console.log('\n📈 Processing Results:');
    console.log('=' .repeat(50));
    console.log(`✅ Emails Processed: ${result.processed}`);
    console.log(`💼 Cargo Records Created: ${result.cargo}`);
    console.log(`🚢 Vessel Records Created: ${result.vessel}`);
    console.log(`📋 Other/Unclassified: ${result.other}`);
    console.log(`❌ Errors: ${result.errors}`);
    
    if (result.errors > 0) {
      console.log(`\n⚠️  Warning: ${result.errors} emails had processing errors`);
    }
    
    // Get updated statistics
    console.log('\n📊 Updated Statistics:');
    const statsAfter = await processor.getProcessingStats();
    console.log(`   Total Emails: ${statsAfter.totalEmails}`);
    console.log(`   Processed: ${statsAfter.processedEmails} (+${statsAfter.processedEmails - statsBefore.processedEmails})`);
    console.log(`   Cargo Records: ${statsAfter.cargoCount} (+${statsAfter.cargoCount - statsBefore.cargoCount})`);
    console.log(`   Vessel Records: ${statsAfter.vesselCount} (+${statsAfter.vesselCount - statsBefore.vesselCount})`);
    console.log(`   Processing Rate: ${statsAfter.processingRate.toFixed(1)}%`);
    
    // Calculate success rate
    if (result.processed > 0) {
      const successRate = ((result.cargo + result.vessel) / result.processed * 100);
      console.log(`   Classification Success Rate: ${successRate.toFixed(1)}%`);
    }
    
    console.log('\n🎉 Email processing completed successfully!');
    
    return result;
    
  } catch (error) {
    console.error('💥 Fatal error during email processing:', error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  processLastMonthEmails()
    .then(() => {
      console.log('\n✨ All done! Exiting...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n🚨 Script failed:', error.message);
      process.exit(1);
    });
}

export { processLastMonthEmails };