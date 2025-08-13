/**
 * E-posta işleme sistemini test etmek için basit script
 * 
 * Kullanım:
 * 1. npm start ile server'ı başlat
 * 2. node test-email-processing.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// Test kullanıcı bilgileri - gerçek bilgilerle değiştirin
const TEST_CREDENTIALS = {
  email: 'test@example.com',
  password: 'test123'
};

let authToken = '';

async function login() {
  try {
    console.log('🔐 Giriş yapılıyor...');
    const response = await axios.post(`${API_BASE}/auth/login`, TEST_CREDENTIALS);
    authToken = response.data.token;
    console.log('✅ Başarıyla giriş yapıldı');
    return true;
  } catch (error) {
    console.error('❌ Giriş başarısız:', error.response?.data?.message || error.message);
    return false;
  }
}

async function getProcessingStats() {
  try {
    console.log('\n📊 İşleme istatistikleri alınıyor...');
    const response = await axios.get(`${API_BASE}/emails/stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const stats = response.data.data;
    console.log('✅ İstatistikler:');
    console.log(`   📧 Toplam e-posta: ${stats.totalEmails}`);
    console.log(`   ✅ İşlenmiş: ${stats.processedEmails}`);
    console.log(`   ⏳ İşlenmemiş: ${stats.unprocessedEmails}`);
    console.log(`   📦 Cargo kayıtları: ${stats.cargoCount}`);
    console.log(`   🚢 Vessel kayıtları: ${stats.vesselCount}`);
    
    return stats;
  } catch (error) {
    console.error('❌ İstatistik alma başarısız:', error.response?.data?.message || error.message);
    return null;
  }
}

async function processUnprocessedEmails() {
  try {
    console.log('\n🔄 İşlenmemiş e-postalar işleniyor...');
    const response = await axios.post(`${API_BASE}/emails/process`, {}, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const result = response.data;
    console.log(`✅ İşleme tamamlandı:`);
    console.log(`   ✅ İşlenen: ${result.processed}`);
    console.log(`   ❌ Hata: ${result.errors}`);
    
    return result;
  } catch (error) {
    console.error('❌ E-posta işleme başarısız:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testGmailPull() {
  try {
    console.log('\n📨 Gmail mesajları çekiliyor...');
    const response = await axios.post(`${API_BASE}/gmail/pull`, {
      email: 'your-gmail@gmail.com' // Gerçek Gmail adresinizi yazın
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const result = response.data;
    console.log(`✅ Gmail pull tamamlandı:`);
    console.log(`   📨 Yeni mesaj: ${result.newMessages}`);
    console.log(`   📊 Toplam fetch: ${result.totalFetched}`);
    
    return result;
  } catch (error) {
    console.error('❌ Gmail pull başarısız:', error.response?.data?.message || error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 E-posta işleme sistemi test ediliyor...\n');
  
  // 1. Giriş yap
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('\n❌ Test sonlandırıldı - giriş başarısız');
    return;
  }
  
  // 2. Başlangıç istatistikleri
  const initialStats = await getProcessingStats();
  
  // 3. Gmail mesajları çek (eğer Gmail bağlantısı varsa)
  console.log('\n🔄 Gmail test ediliyor (isteğe bağlı)...');
  await testGmailPull();
  
  // 4. İşlenmemiş e-postaları işle
  const processResult = await processUnprocessedEmails();
  
  // 5. Son istatistikler
  console.log('\n📊 İşlem sonrası istatistikler:');
  const finalStats = await getProcessingStats();
  
  // 6. Sonuç özeti
  if (initialStats && finalStats) {
    console.log('\n📈 Değişim Özeti:');
    console.log(`   📦 Yeni cargo: ${finalStats.cargoCount - initialStats.cargoCount}`);
    console.log(`   🚢 Yeni vessel: ${finalStats.vesselCount - initialStats.vesselCount}`);
    console.log(`   ✅ İşlenen e-posta: ${finalStats.processedEmails - initialStats.processedEmails}`);
  }
  
  console.log('\n🎉 Test tamamlandı!');
}

// Test'i çalıştır
main().catch(console.error);
