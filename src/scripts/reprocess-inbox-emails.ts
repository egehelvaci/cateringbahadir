import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// AI processing disabled - this script is no longer needed
async function reprocessInboxEmails() {
  logger.info('AI processing disabled - no emails to reprocess');
  
  try {
    const totalEmails = await prisma.inboundEmail.count();
    
    logger.info(`Total emails in database: ${totalEmails}`);
    logger.info('AI processing is disabled - emails are stored as raw data only');
    
    return {
      success: true,
      message: 'AI processing disabled - no reprocessing needed',
      totalEmails
    };
    
  } catch (error) {
    logger.error('Error in reprocess script:', error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  reprocessInboxEmails()
    .then((result) => {
      console.log('Reprocess completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Reprocess failed:', error);
      process.exit(1);
    });
}

export default reprocessInboxEmails;