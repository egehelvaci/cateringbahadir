const fs = require('fs');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testAutoMatchAPI() {
  try {
    console.log('🚀 Gemi-Yük Otomatik Eşleştirme API Testi\n');

    // Test dosyasını oku
    const fileBuffer = fs.readFileSync('C:/Users/ege_h/Downloads/mail-export-2025-09-22T18-56-17-672Z.txt');
    
    // FormData oluştur
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: 'mail-export-2025-09-22T18-56-17-672Z.txt',
      contentType: 'text/plain'
    });
    // Optimal parametreler
    form.append('minMatchScore', '68');
    form.append('maxLaycanGapDays', '3');
    form.append('maxDistanceDays', '2.0');
    form.append('maxOversizeRatio', '0.32');
    form.append('routeFactor', '1.18');

    console.log('📤 API çağrısı yapılıyor...');

    // API çağrısı
    const response = await fetch('http://localhost:3000/api/auto-match', {
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

      if (result.data.vessels && result.data.vessels.length > 0) {
        console.log('🚢 İlk 5 Gemi:');
        result.data.vessels.slice(0, 5).forEach(vessel => {
          console.log(`   • ${vessel.name} - ${vessel.dwt} DWT - ${vessel.currentPort}`);
        });
        console.log(`   ... ve ${result.data.vessels.length - 5} gemi daha\n`);
      }

      if (result.data.cargos && result.data.cargos.length > 0) {
        console.log('📦 İlk 5 Yük:');
        result.data.cargos.slice(0, 5).forEach(cargo => {
          console.log(`   • ${cargo.reference} - ${cargo.quantity} MT - ${cargo.loadPort}`);
        });
        console.log(`   ... ve ${result.data.cargos.length - 5} yük daha\n`);
      }

      if (result.data.matches.length > 0) {
        console.log('🎯 Eşleştirme Sonuçları:');
        result.data.matches.forEach((match, index) => {
          console.log(`\n   ${index + 1}. 🚢 ${match.vessel.name} ↔ 📦 ${match.cargo.reference}`);
          console.log(`      📊 Skor: ${match.matchScore}/100 (${match.recommendation})`);
          console.log(`      📍 ${match.vessel.currentPort} → ${match.cargo.loadPort}`);
          console.log(`      ⚖️  Tonaj: ${match.compatibility.tonnage.cargoSize} / ${match.compatibility.tonnage.vesselCapacity} (${match.compatibility.tonnage.utilization})`);
          console.log(`      🧭 Mesafe: ${match.compatibility.route.distance} - ${match.compatibility.route.sailingDays} gün (10 knot)`);
          
          // Mail bilgileri
          console.log(`      📧 Gemi Maili: "${match.vessel.sourceMail.subject}" - ${match.vessel.sourceMail.sender}`);
          console.log(`      📧 Yük Maili: "${match.cargo.sourceMail.subject}" - ${match.cargo.sourceMail.sender}`);
          
          // Uyumluluk detayları
          if (match.compatibility.requirements && match.compatibility.requirements.missing && match.compatibility.requirements.missing.length > 0) {
            console.log(`      ⚠️  Eksik Gereksinimler: ${match.compatibility.requirements.missing.join(', ')}`);
          }
          
          if (match.compatibility.volume) {
            console.log(`      📦 Hacim: ${match.compatibility.volume.needed} / ${match.compatibility.volume.available} CUFT (${match.compatibility.volume.utilization})`);
          }
          
          console.log(`      💡 ${match.reason}`);
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
      const healthResponse = await fetch('http://localhost:3000/health');
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
