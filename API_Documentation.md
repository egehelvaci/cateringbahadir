# 📧 Gmail IMAP API Dökümantasyonu

## 🔐 Authentication
Tüm endpoint'ler JWT token gerektirir:
```
Headers: {
  "Authorization": "Bearer YOUR_JWT_TOKEN"
}
```

## 📋 API Endpoints

### 1. **IMAP Connection Test**
```http
POST /api/gmail/imap/test
```

**Body:** (Opsiyonel - Environment'tan otomatik alır)
```json
{
  "email": "egeforudemy@gmail.com",        // optional - env'den alır
  "appPassword": "dngsngdtqjzwhqgz"        // optional - env'den alır
}
```

**Basit Kullanım:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "message": "Gmail IMAP connection successful",
  "email": "egeforudemy@gmail.com"
}
```

### 2. **Gmail Messages Fetch** ⭐ *YENİ: Filtering*
```http
POST /api/gmail/imap/messages
```

**Body:** (Email/password opsiyonel - Environment'tan alır)
```json
{
  "email": "egeforudemy@gmail.com",         // optional - env'den alır
  "appPassword": "dngsngdtqjzwhqgz",        // optional - env'den alır
  "limit": 50,                              // optional, default: 50, max: 100
  "folder": "INBOX",                        // optional, default: "INBOX"
  "filterCatering": true                    // 🆕 YENİ: Sadece catering/broker maillerini getir
}
```

**Basit Kullanım:** (En kolay)
```json
{
  "limit": 20,
  "filterCatering": true
}
```

### 3. **Specific Message Details**
```http
POST /api/gmail/imap/message/:messageId
```

## 🎯 Smart Email Filtering (filterCatering: true)

### ✅ **Dahil Edilen Mailler:**
- **Catering:** catering, banquet, event catering, food service
- **Shipping/Broker:** shipbroker, vessel charter, freight rate
- **Business:** contract, invoice, quotation, proposal
- **Turkish:** catering hizmeti, organizasyon, gemi kiralama
- **Company:** edessoy

### ❌ **Filtrelenen Mailler:**
- **Shopping:** Temu, Amazon, AliExpress, eBay
- **Promotional:** discount, sale, offer, free, hediye, indirim
- **Spam:** newsletter, noreply, marketing

## 🚀 Production URL
```
Base URL: https://expressjs-postgres-production-05d5.up.railway.app
```

## 🔑 Login Credentials
```json
{
  "email": "egehelvaci@gmail.com",
  "password": "ege2141486"
}
```

## 📱 Güncellenmiş Frontend Kodu

```javascript
// 🔥 Çok kolay - Sadece business maillerini çek
const fetchBusinessEmails = async () => {
  const response = await fetch('/api/gmail/imap/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      limit: 20,
      filterCatering: true
    })
  });
  
  return await response.json();
};

// Connection test - Çok basit
const testConnection = async () => {
  const response = await fetch('/api/gmail/imap/test', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})  // Boş body yeterli!
  });
  
  return await response.json();
};
```

**Son Güncelleme:** 12 Ağustos 2025 - Environment Variables Entegrasyonu
