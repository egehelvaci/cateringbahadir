const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'testpassword';

// Test data
const testExportRequest = {
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  startTime: '00:00',
  endTime: '23:59',
  fromEmail: 'test@example.com',
  subjectFilter: 'test',
  includeRaw: true
};

async function testMailExportAPI() {
  console.log('🚀 Mail Export API Test Başlatılıyor...\n');

  try {
    // 1. Health check
    console.log('1. Health Check...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Server is healthy:', healthResponse.data);
    console.log('');

    // 2. Login (if needed)
    console.log('2. Authentication...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });
      console.log('✅ Login successful');
      const token = loginResponse.data.token;
      
      // Set authorization header for subsequent requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } catch (loginError) {
      console.log('⚠️  Login failed, trying without auth...');
      // Continue without authentication for testing
    }
    console.log('');

    // 3. Test export statistics
    console.log('3. Export Statistics...');
    try {
      const statsResponse = await axios.get(`${BASE_URL}/api/mail-export/stats`);
      console.log('✅ Export stats:', JSON.stringify(statsResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Stats error:', error.response?.data || error.message);
    }
    console.log('');

    // 4. Test export files list
    console.log('4. Export Files List...');
    try {
      const filesResponse = await axios.get(`${BASE_URL}/api/mail-export/files`);
      console.log('✅ Export files:', JSON.stringify(filesResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Files list error:', error.response?.data || error.message);
    }
    console.log('');

    // 5. Test mail export
    console.log('5. Mail Export Test...');
    try {
      const exportResponse = await axios.post(`${BASE_URL}/api/mail-export/export-txt`, testExportRequest);
      console.log('✅ Export successful:', JSON.stringify(exportResponse.data, null, 2));
      
      // 6. Test file download
      if (exportResponse.data.data?.fileName) {
        console.log('6. File Download Test...');
        try {
          const downloadResponse = await axios.get(
            `${BASE_URL}/api/mail-export/download/${exportResponse.data.data.fileName}`,
            { responseType: 'stream' }
          );
          console.log('✅ File download successful');
          console.log('📁 File size:', downloadResponse.headers['content-length'], 'bytes');
        } catch (downloadError) {
          console.log('❌ Download error:', downloadError.response?.data || downloadError.message);
        }
      }
    } catch (error) {
      console.log('❌ Export error:', error.response?.data || error.message);
    }
    console.log('');

    // 7. Test with different filters
    console.log('7. Test Different Filters...');
    const filterTests = [
      {
        name: 'Son 7 gün',
        filters: {
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        }
      },
      {
        name: 'Sadece kargo mailleri',
        filters: {
          subjectFilter: 'cargo'
        }
      },
      {
        name: 'Belirli saat aralığı',
        filters: {
          startTime: '09:00',
          endTime: '17:00'
        }
      }
    ];

    for (const test of filterTests) {
      try {
        console.log(`   Testing: ${test.name}`);
        const response = await axios.post(`${BASE_URL}/api/mail-export/export-txt`, test.filters);
        console.log(`   ✅ ${test.name}: ${response.data.data?.totalEmails || 0} emails exported`);
      } catch (error) {
        console.log(`   ❌ ${test.name}: ${error.response?.data?.message || error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('\n🏁 Test completed!');
}

// Run the test
testMailExportAPI().catch(console.error);
