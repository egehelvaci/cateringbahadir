# 📧 Chataring Backend API Dokümantasyonu

## 🔐 Authentication
Tüm endpoint'ler JWT token gerektirir:
```
Headers: {
  "Authorization": "Bearer YOUR_JWT_TOKEN"
}
```

## 🚀 Base URL
```
Development: http://localhost:3000
Production: https://expressjs-postgres-production-05d5.up.railway.app
```

---

## 📋 API Endpoints

### 🔑 **Authentication APIs**

#### **POST** `/api/auth/register`
Kullanıcı kaydı oluşturur.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "companyName": "Company Name"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "email": "user@example.com",
    "name": "John Doe",
    "company": "Company Name"
  }
}
```

#### **POST** `/api/auth/login`
Kullanıcı girişi yapar.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "email": "user@example.com",
    "name": "John Doe",
    "company": "Company Name"
  }
}
```

---

### 📧 **Mail Export APIs** ⭐ *YENİ*

#### **POST** `/api/mail-export/export-txt`
Mailleri TXT veya DOCX formatında export eder.

**Request Body:**
```json
{
  "startDate": "2024-01-01",        // YYYY-MM-DD format
  "endDate": "2024-12-31",          // YYYY-MM-DD format
  "startTime": "09:00",             // HH:MM format
  "endTime": "17:00",               // HH:MM format
  "fromEmail": "sender@example.com", // Gönderen email filtresi
  "subjectFilter": "cargo",         // Konu filtresi
  "includeRaw": true,               // Ham içeriği dahil et
  "format": "docx"                  // Export format: "txt" veya "docx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Mail export completed successfully",
  "data": {
    "fileName": "mail-export-2024-01-15T10-30-45-123Z.docx",
    "totalEmails": 150,
    "fileSize": 245760,
    "downloadUrl": "/api/mail-export/download/mail-export-2024-01-15T10-30-45-123Z.docx"
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

#### **GET** `/api/mail-export/download/:fileName`
Export edilmiş TXT veya DOCX dosyasını indirir.

**Response:** TXT veya DOCX dosyası binary olarak döner.

#### **GET** `/api/mail-export/stats`
Export istatistiklerini getirir.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEmails": 1416,
    "cargoEmails": 0,
    "vesselEmails": 0,
    "unprocessedEmails": 0,
    "recentExports": [],
    "exportDirectory": "/path/to/exports"
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

#### **GET** `/api/mail-export/files`
Export dosyalarını listeler.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "fileName": "mail-export-2024-01-15T10-30-45-123Z.txt",
      "size": 245760,
      "created": "2024-01-15T10:30:45.123Z",
      "modified": "2024-01-15T10:30:45.123Z"
    }
  ],
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

---

### 📧 **IMAP Gmail APIs**

#### **POST** `/api/gmail/imap/test`
IMAP bağlantısını test eder.

**Request Body:** (Opsiyonel)
```json
{
  "email": "egeforudemy@gmail.com",
  "appPassword": "dngsngdtqjzwhqgz"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Gmail IMAP connection successful",
  "email": "egeforudemy@gmail.com"
}
```

#### **POST** `/api/gmail/imap/messages`
Gmail maillerini çeker ve veritabanına kaydeder.

**Request Body:**
```json
{
  "email": "egeforudemy@gmail.com",         // optional - env'den alır
  "appPassword": "dngsngdtqjzwhqgz",        // optional - env'den alır
  "limit": 50,                              // optional, default: 50, max: 100
  "folder": "INBOX",                        // optional, default: "INBOX"
  "filterCatering": false                   // optional, default: false (AI filtering removed)
}
```

**Response:**
```json
{
  "success": true,
  "messages": [...],
  "count": 20,
  "fetchedAt": "2024-01-15T10:30:45.123Z"
}
```

#### **POST** `/api/gmail/imap/message/:messageId`
Belirli bir mailin detaylarını getirir.

**Response:**
```json
{
  "success": true,
  "message": {
    "id": "messageId",
    "subject": "Mail Subject",
    "from": "sender@example.com",
    "body": "Mail content...",
    "date": "2024-01-15T10:30:45.123Z"
  }
}
```

---

### 🔗 **Google OAuth APIs**

#### **GET** `/api/oauth2/authorize`
Google OAuth yetkilendirme URL'ini döner.

**Response:**
```json
{
  "success": true,
  "authUrl": "https://accounts.google.com/oauth2/authorize?..."
}
```

#### **GET** `/api/oauth2/callback`
OAuth callback handler.

**Query Parameters:**
- `code`: Authorization code
- `state`: Optional state parameter

**Response:**
```json
{
  "success": true,
  "message": "Gmail account connected successfully",
  "email": "user@gmail.com",
  "name": "User Name",
  "connectedAt": "2024-01-15T10:30:45.123Z"
}
```

#### **GET** `/api/oauth2/accounts`
Bağlı Gmail hesaplarını listeler.

**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "email": "user@gmail.com",
      "connectedAt": "2024-01-15T10:30:45.123Z"
    }
  ]
}
```

#### **POST** `/api/oauth2/gmail/pull`
Belirli bir Gmail hesabından yeni mailleri çeker.

**Request Body:**
```json
{
  "email": "user@gmail.com"
}
```

**Response:**
```json
{
  "success": true,
  "email": "user@gmail.com",
  "newMessages": 5,
  "totalFetched": 20,
  "pulledAt": "2024-01-15T10:30:45.123Z"
}
```

#### **POST** `/api/oauth2/gmail/pull-all`
Tüm bağlı hesaplardan mailleri çeker.

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "email": "user1@gmail.com",
      "success": true,
      "newMessages": 5,
      "totalFetched": 20
    }
  ],
  "totalNewMessages": 5,
  "pulledAt": "2024-01-15T10:30:45.123Z"
}
```

#### **DELETE** `/api/oauth2/gmail/revoke`
Gmail erişimini iptal eder.

**Request Body:**
```json
{
  "email": "user@gmail.com"
}
```

#### **GET** `/api/oauth2/gmail/messages/:email`
Belirli bir Gmail hesabının maillerini listeler.

**Query Parameters:**
- `maxResults`: Maksimum sonuç sayısı (1-100)
- `labelIds`: Etiket ID'leri (virgülle ayrılmış)
- `q`: Arama sorgusu
- `includeSpamTrash`: Spam/çöp kutusunu dahil et

**Response:**
```json
{
  "success": true,
  "email": "user@gmail.com",
  "messages": [...],
  "count": 20,
  "fetchedAt": "2024-01-15T10:30:45.123Z"
}
```

---

### 📊 **Analytics APIs**

#### **GET** `/api/analytics/dashboard`
Dashboard istatistiklerini getirir.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEmails": 1416,
    "recentEmails": 50,
    "exportStats": {
      "totalExports": 5,
      "lastExport": "2024-01-15T10:30:45.123Z"
    }
  }
}
```

---

### 📧 **Email Processing APIs**

#### **POST** `/api/emails/process`
İşlenmemiş mailleri işler (AI processing disabled).

**Response:**
```json
{
  "success": true,
  "message": "Email processing completed",
  "processed": 0,
  "errors": 0,
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

#### **POST** `/api/emails/process-enhanced`
Gelişmiş mail işleme (AI processing disabled).

**Response:**
```json
{
  "success": true,
  "message": "Enhanced email processing completed",
  "processed": 0,
  "cargoCreated": 0,
  "vesselCreated": 0,
  "errors": 0,
  "skipped": 0,
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

#### **GET** `/api/emails/stats`
Mail işleme istatistiklerini getirir.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEmails": 1416,
    "processedEmails": 0,
    "unprocessedEmails": 1416,
    "cargoCount": 0,
    "vesselCount": 0
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

#### **POST** `/api/emails/start-automation`
Otomatik mail işlemeyi başlatır (AI processing disabled).

**Response:**
```json
{
  "success": true,
  "message": "Automated email processing started - will run every 5 minutes",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

---

### 📥 **Inbox APIs**

#### **GET** `/inbox`
Inbox sayfasını döner (HTML).

#### **GET** `/inbox/emails`
Inbox maillerini listeler.

**Query Parameters:**
- `page`: Sayfa numarası
- `limit`: Sayfa başına kayıt sayısı
- `search`: Arama terimi

**Response:**
```json
{
  "success": true,
  "emails": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1416,
    "pages": 71
  }
}
```

---

### 👥 **Employee APIs**

#### **GET** `/api/employees`
Çalışanları listeler.

**Response:**
```json
{
  "success": true,
  "employees": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "department": "IT",
      "isActive": true
    }
  ]
}
```

#### **POST** `/api/employees`
Yeni çalışan oluşturur.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "department": "IT"
}
```

#### **PUT** `/api/employees/:id`
Çalışan bilgilerini günceller.

#### **DELETE** `/api/employees/:id`
Çalışanı siler.

---

### 📦 **Order APIs**

#### **GET** `/api/orders`
Siparişleri listeler.

**Response:**
```json
{
  "success": true,
  "orders": [
    {
      "id": 1,
      "orderNumber": "ORD-001",
      "customerName": "Customer Name",
      "status": "PENDING",
      "totalAmount": 100.50,
      "createdAt": "2024-01-15T10:30:45.123Z"
    }
  ]
}
```

#### **POST** `/api/orders`
Yeni sipariş oluşturur.

**Request Body:**
```json
{
  "customerName": "Customer Name",
  "customerPhone": "+1234567890",
  "totalAmount": 100.50,
  "notes": "Order notes"
}
```

#### **GET** `/api/orders/:id`
Belirli bir siparişin detaylarını getirir.

#### **PUT** `/api/orders/:id`
Sipariş bilgilerini günceller.

#### **POST** `/api/orders/:id/qr-scan`
QR kod okutma işlemi.

**Request Body:**
```json
{
  "qrCode": "QR123456",
  "scanType": 1,
  "employeeId": 1
}
```

---

### 🔧 **Debug APIs**

#### **GET** `/api/debug/health`
Sistem sağlık durumunu kontrol eder.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "database": "connected",
  "services": {
    "imap": "running",
    "mailProcessor": "disabled"
  }
}
```

#### **GET** `/api/debug/logs`
Sistem loglarını getirir.

#### **POST** `/api/debug/test-email`
Test email gönderir.

---

### ⚙️ **Settings APIs**

#### **GET** `/api/settings`
Sistem ayarlarını getirir.

#### **PUT** `/api/settings`
Sistem ayarlarını günceller.

---

### 🔔 **Notifications APIs**

#### **GET** `/api/notifications`
Bildirimleri listeler.

#### **POST** `/api/notifications`
Yeni bildirim oluşturur.

#### **PUT** `/api/notifications/:id/read`
Bildirimi okundu olarak işaretler.

---

## 🎯 **Sistem Özellikleri**

### ✅ **Aktif Özellikler:**
- **Mail Çekme**: IMAP ile Gmail'den otomatik mail çekme (5 dakikada bir)
- **Mail Export**: TXT formatında mail export (tarih/saat filtreleri ile)
- **Authentication**: JWT tabanlı kullanıcı doğrulama
- **Google OAuth**: Gmail hesap bağlama
- **Order Management**: QR kod tabanlı sipariş yönetimi
- **Employee Management**: Çalışan yönetimi
- **Analytics**: Dashboard ve istatistikler

### ❌ **Devre Dışı Özellikler:**
- **AI Classification**: Mail sınıflandırması kaldırıldı
- **AI Extraction**: AI ile veri çıkarma kaldırıldı
- **AI Matching**: Otomatik eşleştirme kaldırıldı
- **Cargo/Vessel Tables**: AI tabloları silindi
- **Automated Processing**: AI işleme devre dışı

---

## 🔑 **Test Credentials**

```json
{
  "email": "egehelvaci@gmail.com",
  "password": "12345678"
}
```

---

## 📱 **Frontend Integration Examples**

### Mail Export
```javascript
// TXT export
const exportMailsTxt = async () => {
  const response = await fetch('/api/mail-export/export-txt', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      includeRaw: true,
      format: 'txt'
    })
  });
  
  return await response.json();
};

// Word export
const exportMailsWord = async () => {
  const response = await fetch('/api/mail-export/export-txt', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      includeRaw: true,
      format: 'docx'
    })
  });
  
  return await response.json();
};
```

### IMAP Connection Test
```javascript
// IMAP test
const testConnection = async () => {
  const response = await fetch('/api/gmail/imap/test', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  
  return await response.json();
};
```

### Fetch Messages
```javascript
// Fetch messages
const fetchMessages = async () => {
  const response = await fetch('/api/gmail/imap/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      limit: 20
    })
  });
  
  return await response.json();
};
```

---

## 🚨 **Error Handling**

### Common Error Responses
```json
{
  "status": "error",
  "message": "Error description",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### HTTP Status Codes
- **200**: Success
- **201**: Created
- **400**: Bad Request
- **401**: Unauthorized
- **404**: Not Found
- **429**: Rate Limit Exceeded
- **500**: Internal Server Error

---

## 🔄 **Rate Limiting**

- **Authentication**: 10 requests/minute
- **Mail Export**: 10 requests/minute
- **Other APIs**: 100 requests/minute

---

**Son Güncelleme:** 22 Eylül 2025 - AI Sistemi Kaldırıldı, Basitleştirilmiş Mail İşleme