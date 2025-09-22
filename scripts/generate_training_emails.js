const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Generate 1000+ training emails
const syntheticEmails = [
  // CARGO emails (500 examples)
  ...Array.from({ length: 150 }, (_, i) => ({
    subject: `Steel cargo inquiry ${1000 + i}`,
    raw: `Steel billets cargo ${15000 + i * 100} MT loading from ${getRandomPort()} discharge to ${getRandomPort()}. Laycan ${getRandomDate()}. Looking for suitable vessel.`,
    fromAddr: `trader${i}@steel.com`,
    parsedType: 'CARGO',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 120 }, (_, i) => ({
    subject: `Grain shipment ${2000 + i}`,
    raw: `Wheat cargo ${25000 + i * 200} MT from ${getRandomPort()} to ${getRandomPort()}. Need Panamax vessel. Laycan ${getRandomDate()}. Competitive freight rates.`,
    fromAddr: `grain${i}@agri.com`,
    parsedType: 'CARGO',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 100 }, (_, i) => ({
    subject: `Coal cargo available`,
    raw: `Steam coal ${40000 + i * 500} MT Indonesia to China. Looking for Capesize vessel. Loading port ${getRandomPort()}. Discharge ${getRandomPort()}.`,
    fromAddr: `coal${i}@mining.com`,
    parsedType: 'CARGO',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 80 }, (_, i) => ({
    subject: `Iron ore shipment inquiry`,
    raw: `Iron ore fines ${80000 + i * 1000} MT from Australia to China. Capesize required. Laycan ${getRandomDate()}.`,
    fromAddr: `ironore${i}@mining.au`,
    parsedType: 'CARGO',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 50 }, (_, i) => ({
    subject: `Container cargo booking`,
    raw: `${50 + i} TEU containers electronics from ${getRandomPort()} to ${getRandomPort()}. FCL shipment ready for loading.`,
    fromAddr: `container${i}@logistics.com`,
    parsedType: 'CARGO',
    timestamp: getRandomTimestamp()
  })),
  
  // VESSEL emails (400 examples)
  ...Array.from({ length: 120 }, (_, i) => ({
    subject: `MV ${getVesselName()} - Bulk carrier open`,
    raw: `Vessel MV ${getVesselName()} ${35000 + i * 500} DWT Handymax bulk carrier open ${getRandomPort()} from ${getRandomDate()}. Geared with cranes.`,
    fromAddr: `ops${i}@shipping.com`,
    parsedType: 'VESSEL',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 100 }, (_, i) => ({
    subject: `Panamax vessel available`,
    raw: `Panamax bulk carrier ${65000 + i * 300} DWT available for charter. Currently ${getRandomPort()}. Next open ${getRandomDate()}.`,
    fromAddr: `charter${i}@maritime.com`,
    parsedType: 'VESSEL',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 80 }, (_, i) => ({
    subject: `Container vessel ${getVesselName()}`,
    raw: `Container vessel ${4000 + i * 100} TEU capacity available spot charter. Position ${getRandomPort()}. Reefer plugs available.`,
    fromAddr: `container${i}@lines.com`,
    parsedType: 'VESSEL',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 60 }, (_, i) => ({
    subject: `Tanker vessel for charter`,
    raw: `Product tanker ${25000 + i * 200} DWT double hull available. IMO certified. Open ${getRandomPort()} ${getRandomDate()}.`,
    fromAddr: `tanker${i}@fleet.com`,
    parsedType: 'VESSEL',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 40 }, (_, i) => ({
    subject: `Capesize ${getVesselName()} open`,
    raw: `Capesize vessel ${150000 + i * 1000} DWT open Brazil. Suitable for iron ore coal shipments. Next voyage availability.`,
    fromAddr: `cape${i}@bulk.com`,
    parsedType: 'VESSEL',
    timestamp: getRandomTimestamp()
  })),
  
  // OTHER emails (100 examples)
  ...Array.from({ length: 30 }, (_, i) => ({
    subject: `Market report ${i}`,
    raw: `Freight market update for ${getRandomDate()}. Rates increasing on major trade routes. Bunker prices stable.`,
    fromAddr: `report${i}@market.com`,
    parsedType: 'OTHER',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 35 }, (_, i) => ({
    subject: `Port congestion update`,
    raw: `Port of ${getRandomPort()} experiencing delays. Average waiting time 3-5 days. Recommend alternative ports.`,
    fromAddr: `port${i}@authority.com`,
    parsedType: 'OTHER',
    timestamp: getRandomTimestamp()
  })),
  
  ...Array.from({ length: 35 }, (_, i) => ({
    subject: `Bunker price update`,
    raw: `Bunker fuel prices ${getRandomPort()} IFO380: $${400 + i} MGO: $${600 + i}. Prices effective from ${getRandomDate()}.`,
    fromAddr: `bunker${i}@fuel.com`,
    parsedType: 'OTHER',
    timestamp: getRandomTimestamp()
  }))
];

// Helper functions
function getRandomPort() {
  const ports = [
    'Singapore', 'Rotterdam', 'Shanghai', 'Houston', 'Hamburg', 'Santos', 
    'Yokohama', 'Antwerp', 'Dubai', 'Hong Kong', 'Busan', 'Ningbo',
    'Qingdao', 'Tianjin', 'Guangzhou', 'Jebel Ali', 'Port Said', 'Sohar',
    'Odessa', 'Chornomorsk', 'Istanbul', 'Piraeus', 'Valencia', 'Barcelona'
  ];
  return ports[Math.floor(Math.random() * ports.length)];
}

function getVesselName() {
  const names = [
    'Pacific Star', 'Ocean Glory', 'Sea Victory', 'Maritime Dream', 'Blue Horizon',
    'Global Trader', 'Eastern Spirit', 'Western Pride', 'Northern Light', 'Southern Cross',
    'Atlantic Wave', 'Pacific Dawn', 'Ocean Breeze', 'Sea Champion', 'Maritime Legend',
    'Golden Eagle', 'Silver Dolphin', 'Crystal Bay', 'Emerald Sea', 'Diamond Star'
  ];
  return names[Math.floor(Math.random() * names.length)];
}

function getRandomDate() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = Math.floor(Math.random() * 28) + 1;
  const month = months[Math.floor(Math.random() * months.length)];
  return `${day} ${month}`;
}

function getRandomTimestamp() {
  const now = new Date();
  const daysBack = Math.floor(Math.random() * 365);
  return new Date(now - daysBack * 24 * 60 * 60 * 1000);
}

async function insertTrainingEmails() {
  console.log(`🔄 Inserting ${syntheticEmails.length} training emails...`);
  
  try {
    let inserted = 0;
    const batchSize = 50;
    
    // Insert in batches to avoid overwhelming the database
    for (let i = 0; i < syntheticEmails.length; i += batchSize) {
      const batch = syntheticEmails.slice(i, i + batchSize);
      
      for (const email of batch) {
        try {
          await prisma.inboundEmail.create({
            data: {
              subject: email.subject,
              raw: email.raw,
              fromAddr: email.fromAddr,
              parsedType: email.parsedType,
              createdAt: email.timestamp
            }
          });
          inserted++;
        } catch (error) {
          console.error(`Failed to insert email: ${error.message}`);
        }
      }
      
      console.log(`📧 Inserted batch ${Math.ceil((i + batchSize) / batchSize)} (${inserted} total)`);
    }
    
    console.log(`✅ Successfully inserted ${inserted} emails`);
    
    // Show final distribution
    const distribution = await prisma.inboundEmail.groupBy({
      by: ['parsedType'],
      _count: {
        id: true
      }
    });
    
    console.log('\n📊 Final email distribution:');
    distribution.forEach(item => {
      console.log(`   ${item.parsedType || 'NULL'}: ${item._count.id} emails`);
    });
    
  } catch (error) {
    console.error('❌ Error inserting emails:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  insertTrainingEmails()
    .then(() => {
      console.log('\n🎉 Training email generation completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { insertTrainingEmails };