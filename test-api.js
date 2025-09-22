const fs = require('fs');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testAutoMatchAPI() {
  try {
    console.log('🚀 Gemi-Yük Otomatik Eşleştirme API Testi\n');

    // Test dosyasını oku
    const fileBuffer = fs.readFileSync('test-mail.txt');
    
    // FormData oluştur
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: 'test-mail.txt',
      contentType: 'text/plain'
    });
    form.append('minMatchScore', '60');
    form.append('maxLaycanGapDays', '5');

    console.log('📤 API çağrısı yapılıyor...');

    // API çağrısı
    const response = await fetch('http://localhost:3001/api/auto-match', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ API çağrısı başarılı!\n');
      console.log('📊 Sonuç Özeti:');
      console.log(`   • Dosya: ${result.data.summary.fileName}`);
      console.log(`   • İşlem Süresi: ${result.data.summary.processingTime}`);
      console.log(`   • Bulunan Gemiler: ${result.data.summary.vesselsFound}`);
      console.log(`   • Bulunan Yükler: ${result.data.summary.cargosFound}`);
      console.log(`   • Toplam Eşleşme: ${result.data.summary.totalMatches}\n`);

      if (result.data.vessels.length > 0) {
        console.log('🚢 Bulunan Gemiler:');
        result.data.vessels.forEach(vessel => {
          console.log(`   • ${vessel.name} - ${vessel.dwt} DWT - ${vessel.currentPort}`);
        });
        console.log('');
      }

      if (result.data.cargos.length > 0) {
        console.log('📦 Bulunan Yükler:');
        result.data.cargos.forEach(cargo => {
          console.log(`   • ${cargo.reference} - ${cargo.quantity} MT - ${cargo.loadPort}`);
        });
        console.log('');
      }

      if (result.data.matches.length > 0) {
        console.log('🎯 Eşleştirme Sonuçları:');
        result.data.matches.forEach((match, index) => {
          console.log(`   ${index + 1}. ${match.vessel.name} ↔ ${match.cargo.reference}`);
          console.log(`      Skor: ${match.matchScore}/100`);
          console.log(`      Öneri: ${match.recommendation}`);
          console.log(`      Gerekçe: ${match.reason}\n`);
        });
      } else {
        console.log('❌ Hiç eşleşme bulunamadı');
      }

    } else {
      console.log('❌ API hatası:', result.message);
      if (result.error) {
        console.log('Hata detayı:', result.error);
      }
    }

  } catch (error) {
    console.error('💥 Test hatası:', error.message);
    
    // Server çalışıyor mu kontrol et
    try {
      const healthResponse = await fetch('http://localhost:3001/health');
      if (healthResponse.ok) {
        console.log('✅ Server çalışıyor');
      } else {
        console.log('❌ Server yanıt vermiyor');
      }
    } catch (healthError) {
      console.log('❌ Server\'a ulaşılamıyor. Lütfen `node simple-server.js` ile serveri başlatın.');
    }
  }
}

// Test'i çalıştır
testAutoMatchAPI();
