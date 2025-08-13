# 🚢 Broker Backend API Documentation

## Genel Bakış

Bu API, denizcilik brokerlik işlemleri için tasarlanmış kapsamlı bir backend sistemidir. Email otomasyonu, AI sınıflandırma, kargo-gemi eşleştirme ve broker işlemlerini destekler.

### Temel Özellikler
- ✅ Gmail IMAP entegrasyonu ile otomatik email çekme
- ✅ GPT-4 AI ile email sınıflandırma (CARGO/VESSEL)
- ✅ Otomatik Cargo ve Vessel kayıt oluşturma
- ✅ AI destekli kargo-gemi eşleştirme sistemi
- ✅ RESTful API endpoints
- ✅ PostgreSQL veritabanı
- ✅ JWT authentication

### Base URL
```
http://localhost:3000/api
```

### Production URL
```
https://chataring-backend.up.railway.app/api
```

## Authentication

Tüm API'ler JWT token authentication kullanır. Önce login olup token almalısınız.

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "egehelvaci@gmail.com",
  "password": "ege2141486"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "email": "egehelvaci@gmail.com",
    "name": "Test User",
    "company": "Test Company"
  }
}
```

### Authorization Header
Tüm API çağrılarında bu header'ı kullanın:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 📧 Inbox & Email APIs

### 1. Tüm Inbox Emaillerini Getir
```http
GET /inbox/emails?page=1&limit=50&type=CARGO
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `page` (optional): Sayfa numarası (default: 1)
- `limit` (optional): Sayfa başına kayıt (default: 50, max: 100)
- `type` (optional): Email tipi (CARGO, VESSEL)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 22,
      "messageId": "gmail-1510",
      "fromAddr": "\"Edessoy Chartering\" <chartering@edessoy.com>",
      "subject": "Fwd: M/V FILIKCI 3 - Open @ Eastmed 01-05 September",
      "receivedAt": "2025-08-12T20:54:43.000Z",
      "parsedType": "VESSEL",
      "parsedJson": {
        "aiClassification": {
          "type": "VESSEL",
          "confidence": 0.85,
          "extractedData": {
            "vesselName": "FILIKCI 3",
            "currentLocation": "Eastmed"
          }
        }
      },
      "createdAt": "2025-08-12T20:57:53.594Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 25,
    "totalPages": 1
  }
}
```

### 2. Gmail IMAP ile Yeni Emailler Çek
```http
POST /gmail/imap/messages
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "limit": 10,
  "filterCatering": true,
  "saveToDb": true
}
```

**Parameters:**
- `email` (optional): Gmail adresi (env'den alınır)
- `appPassword` (optional): Gmail App Password (env'den alınır)
- `folder` (optional): IMAP klasörü (default: "INBOX")
- `limit` (optional): Email sayısı (1-100, default: 50)
- `filterCatering` (optional): Catering/broker emaillerini filtrele (default: false)
- `saveToDb` (optional): Veritabanına kaydet (default: true)

**Response:**
```json
{
  "success": true,
  "email": "egeforudemy@gmail.com",
  "folder": "INBOX",
  "messageCount": 2,
  "messages": [
    {
      "id": "1509",
      "subject": "Fwd: (REF 4374.12.8.25NSZ) PIRAEUS/JEDDAH- SMALL PROJECT- END AUGUST",
      "from": "\"Edessoy Chartering\" <chartering@edessoy.com>",
      "to": "egeforudemy@gmail.com",
      "date": "2025-08-12T20:54:26.000Z",
      "bodyPreview": "---------- Forwarded message ---------...",
      "hasHtml": true,
      "attachmentCount": 1
    }
  ]
}
```

---

## 📦 Cargo APIs

### 1. Tüm Cargo Kayıtlarını Getir
```http
GET /cargo?page=1&limit=50&commodity=grain&search=wheat
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `page` (optional): Sayfa numarası (default: 1)
- `limit` (optional): Sayfa başına kayıt (1-100, default: 50)
- `commodity` (optional): Emtia filtresi
- `loadPort` (optional): Yükleme limanı filtresi
- `dischargePort` (optional): Boşaltma limanı filtresi
- `search` (optional): Genel arama (commodity, port, notes'ta arar)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "commodity": "Wheat",
      "qtyValue": 50000,
      "qtyUnit": "mt",
      "loadPort": "Houston",
      "dischargePort": "Rotterdam",
      "laycanStart": "2025-09-15T00:00:00.000Z",
      "laycanEnd": "2025-09-20T00:00:00.000Z",
      "notes": "Auto-extracted from email: Cargo inquiry...",
      "createdAt": "2025-08-12T20:54:50.304Z",
      "_count": {
        "matches": 2
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 15,
    "totalPages": 1
  }
}
```

### 2. Spesifik Cargo Detayı
```http
GET /cargo/1
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "commodity": "Wheat",
    "qtyValue": 50000,
    "qtyUnit": "mt",
    "loadPort": "Houston",
    "dischargePort": "Rotterdam",
    "laycanStart": "2025-09-15T00:00:00.000Z",
    "laycanEnd": "2025-09-20T00:00:00.000Z",
    "notes": "Auto-extracted from email...",
    "createdAt": "2025-08-12T20:54:50.304Z",
    "matches": [
      {
        "id": 1,
        "vesselId": 1,
        "status": "PENDING",
        "aiScore": 85.5,
        "vessel": {
          "id": 1,
          "name": "MV Atlantic",
          "dwt": 75000
        }
      }
    ]
  }
}
```

---

## 🚢 Vessel APIs

### 1. Tüm Vessel Kayıtlarını Getir
```http
GET /vessels?page=1&limit=50&name=bulk&minDwt=50000&maxDwt=100000
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `page` (optional): Sayfa numarası (default: 1)
- `limit` (optional): Sayfa başına kayıt (1-100, default: 50)
- `name` (optional): Gemi adı filtresi
- `currentArea` (optional): Mevcut bölge filtresi
- `minDwt` (optional): Minimum DWT
- `maxDwt` (optional): Maximum DWT
- `search` (optional): Genel arama (name, imo, currentArea, notes'ta arar)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "MV FILIKCI 3",
      "imo": "9011985",
      "dwt": 1906,
      "capacityTon": 1906,
      "currentArea": "Eastmed",
      "availableFrom": "2025-09-01T00:00:00.000Z",
      "gear": "GEARLESS",
      "notes": "Auto-extracted from email: M/V FILIKCI 3...",
      "createdAt": "2025-08-12T20:57:53.594Z",
      "_count": {
        "matches": 1
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 8,
    "totalPages": 1
  }
}
```

### 2. Spesifik Vessel Detayı
```http
GET /vessels/1
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "MV FILIKCI 3",
    "imo": "9011985",
    "dwt": 1906,
    "capacityTon": 1906,
    "currentArea": "Eastmed",
    "availableFrom": "2025-09-01T00:00:00.000Z",
    "gear": "GEARLESS",
    "notes": "Auto-extracted from email...",
    "createdAt": "2025-08-12T20:57:53.594Z",
    "matches": [
      {
        "id": 1,
        "cargoId": 1,
        "status": "PENDING",
        "aiScore": 85.5,
        "cargo": {
          "id": 1,
          "commodity": "Wheat",
          "qtyValue": 50000
        }
      }
    ]
  }
}
```

---

## 🤖 AI Matching APIs

### 1. Tüm Eşleştirmeleri Getir
```http
GET /matches?page=1&limit=50&status=PENDING&minScore=70
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `page` (optional): Sayfa numarası (default: 1)
- `limit` (optional): Sayfa başına kayıt (1-100, default: 50)
- `status` (optional): Eşleştirme durumu (PENDING, CONFIRMED, REJECTED)
- `minScore` (optional): Minimum AI skoru (0-100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "cargoId": 1,
      "vesselId": 1,
      "status": "PENDING",
      "aiScore": 85.5,
      "aiAnalysis": {
        "score": 85.5,
        "compatibility": "EXCELLENT",
        "reasons": [
          "Good capacity match",
          "Suitable vessel type",
          "Geographic proximity"
        ],
        "concerns": [],
        "recommendations": [
          "Confirm exact loading dates",
          "Verify discharge arrangements"
        ]
      },
      "createdAt": "2025-08-12T21:00:00.000Z",
      "cargo": {
        "id": 1,
        "commodity": "Wheat",
        "qtyValue": 50000,
        "loadPort": "Houston"
      },
      "vessel": {
        "id": 1,
        "name": "MV Atlantic",
        "dwt": 75000,
        "currentArea": "Gulf"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "totalPages": 1
  }
}
```

### 2. AI ile En İyi Eşleştirmeleri Bul
```http
POST /matches/find
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "cargoId": 1,
  "limit": 10
}
```

**Parameters:**
- `cargoId` (optional): Spesifik cargo için eşleştirme bul
- `vesselId` (optional): Spesifik vessel için eşleştirme bul
- `limit` (optional): Döndürülecek eşleştirme sayısı (1-50, default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "cargo": {
        "id": 1,
        "commodity": "Wheat",
        "qtyValue": 50000,
        "loadPort": "Houston",
        "dischargePort": "Rotterdam"
      },
      "vessel": {
        "id": 1,
        "name": "MV Atlantic",
        "dwt": 75000,
        "currentArea": "Gulf"
      },
      "matching": {
        "score": 92,
        "compatibility": "EXCELLENT",
        "reasons": [
          "Perfect capacity match (66% utilization)",
          "Vessel available in time window",
          "Suitable vessel type for grain cargo",
          "Good geographic positioning"
        ],
        "concerns": [],
        "recommendations": [
          "Confirm loading terminal availability",
          "Verify discharge port restrictions",
          "Calculate ballast voyage costs"
        ]
      }
    }
  ],
  "message": "Found 5 potential matches"
}
```

### 3. Kargo-Gemi Eşleştirmesi Analiz Et
```http
POST /matches/analyze
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "cargoId": 1,
  "vesselId": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cargo": {
      "id": 1,
      "commodity": "Wheat",
      "qtyValue": 50000,
      "loadPort": "Houston"
    },
    "vessel": {
      "id": 1,
      "name": "MV Atlantic",
      "dwt": 75000,
      "currentArea": "Gulf"
    },
    "analysis": {
      "score": 88,
      "compatibility": "EXCELLENT",
      "reasons": [
        "Good capacity utilization (66%)",
        "Vessel positioned near load port",
        "Timing compatibility confirmed"
      ],
      "concerns": [
        "Consider weather window for discharge port"
      ],
      "recommendations": [
        "Verify vessel specifications",
        "Confirm loading/discharge arrangements",
        "Calculate ballast and positioning costs"
      ]
    }
  },
  "message": "AI analysis completed"
}
```

### 4. Yeni Eşleştirme Oluştur
```http
POST /matches
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "cargoId": 1,
  "vesselId": 1
}
```

**Parameters:**
- `cargoId` (required): Cargo ID'si
- `vesselId` (required): Vessel ID'si
- `manualScore` (optional): Manuel skor (0-100, yoksa AI hesaplar)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "cargoId": 1,
    "vesselId": 1,
    "status": "PENDING",
    "aiScore": 88.5,
    "aiAnalysis": {
      "score": 88.5,
      "compatibility": "EXCELLENT",
      "reasons": [...],
      "concerns": [...],
      "recommendations": [...]
    },
    "createdAt": "2025-08-12T21:15:00.000Z",
    "cargo": {...},
    "vessel": {...}
  },
  "message": "Match created successfully with AI analysis"
}
```

### 5. Eşleştirme Durumunu Güncelle
```http
PATCH /matches/1
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "status": "CONFIRMED",
  "notes": "Deal confirmed at USD 35/mt"
}
```

**Parameters:**
- `status` (required): Yeni durum (PENDING, CONFIRMED, REJECTED)
- `notes` (optional): Ek notlar

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "CONFIRMED",
    "notes": "Deal confirmed at USD 35/mt",
    "updatedAt": "2025-08-12T21:20:00.000Z",
    "cargo": {...},
    "vessel": {...}
  },
  "message": "Match updated successfully"
}
```

### 6. Otomatik Eşleştirme
```http
POST /matches/auto
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "minScore": 80,
  "maxMatches": 15
}
```

**Parameters:**
- `minScore` (optional): Minimum AI skoru (0-100, default: 70)
- `maxMatches` (optional): Maksimum eşleştirme sayısı (1-20, default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 6,
      "cargoId": 2,
      "vesselId": 3,
      "aiScore": 89.2,
      "status": "PENDING"
    },
    {
      "id": 7,
      "cargoId": 1,
      "vesselId": 2,
      "aiScore": 85.7,
      "status": "PENDING"
    }
  ],
  "message": "Created 2 automatic matches with score ≥ 80%"
}
```

---

## 🔧 Sistem Durumu APIs

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-12T21:30:00.000Z"
}
```

---

## 🎯 AI Sınıflandırma Sistemi

### Email Sınıflandırma Kuralları

AI sistemi gelen emailleri otomatik olarak analiz eder ve şu kriterlere göre sınıflandırır:

**CARGO Emailleri:**
- Emtia arayışları (grain, coal, iron ore, wheat, corn, soybeans)
- "cargo available", "seeking vessel", "tonnage required" gibi ifadeler
- Yükleme/boşaltma limanları belirtilen
- Laycan tarihleri içeren

**VESSEL Emailleri:**
- Gemi pozisyonları (vessel, ship, tanker, bulker)
- "vessel available", "seeking cargo", "ship open" gibi ifadeler
- DWT, IMO, mevcut pozisyon bilgileri
- Gemi spesifikasyonları

### Çıkarılan Veriler

AI sistemi aşağıdaki verileri otomatik çıkarır:

**Cargo için:**
- Emtia türü (commodity)
- Miktar (quantity + unit)
- Yükleme limanı (loadPort)
- Boşaltma limanı (dischargePort)
- Laycan tarihleri (laycan)

**Vessel için:**
- Gemi adı (vesselName)
- IMO numarası
- DWT kapasitesi
- Mevcut pozisyon (currentLocation)
- Müsaitlik tarihi (availability)

---

## 📊 Filtreler ve Arama

### Genel Arama Özellikleri

**Inbox Emails:**
- Email tipi filtreleme (CARGO/VESSEL)
- Tarih aralığı
- Gönderen adresi

**Cargo:**
- Emtia türü (commodity)
- Yükleme/boşaltma limanları
- Miktar aralığı
- Tarih filtreleri
- Genel metin arama

**Vessel:**
- Gemi adı
- DWT aralığı
- Mevcut bölge
- Müsaitlik tarihi
- Gemi tipi

**Matches:**
- AI skor aralığı
- Eşleştirme durumu
- Oluşturulma tarihi
- Cargo/Vessel ID'si

---

## 🚀 Deployment & Environment

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"

# OpenAI
OPENAI_API_KEY="sk-..."
OPENAI_EXTRACT_MODEL="gpt-4o-mini"
EXTRACTION_TEMPERATURE="0"

# Gmail IMAP
GMAIL_IMAP_EMAIL="your-email@gmail.com"
GMAIL_IMAP_APP_PASSWORD="your-app-password"
ENABLE_GMAIL_POLLING="true"

# Server
PORT="3000"
NODE_ENV="production"
```

### Gmail IMAP Kurulumu

1. Gmail hesabında 2FA aktif olmalı
2. App Password oluşturun:
   - Google Account → Security → App passwords
   - "Mail" seçip password oluşturun
3. Environment variable'a ekleyin

### Otomatik Email Sistemi

Sistem her 5 dakikada bir Gmail'i kontrol eder:
1. Yeni emailler IMAP ile çekilir
2. Catering/broker filtreleri uygulanır
3. AI (GPT-4) ile sınıflandırılır
4. CARGO/VESSEL olarak belirlenir
5. Otomatik Cargo/Vessel kayıtları oluşturulur
6. InboundEmail tablosuna kaydedilir

---

## 📈 AI Eşleştirme Algoritması

### Eşleştirme Kriterleri

AI sistemi şu faktörleri değerlendirir:

1. **Kapasite Uyumluluğu** (30 puan)
   - Kargo miktarı vs gemi kapasitesi
   - %70-100 arası ideal kullanım

2. **Coğrafi Konum** (25 puan)
   - Geminin mevcut pozisyonu
   - Yükleme limanına uzaklık

3. **Zaman Uyumluluğu** (25 puan)
   - Laycan vs müsaitlik tarihi
   - Seyir süresi hesabı

4. **Gemi Tipi Uygunluğu** (15 puan)
   - Kargo türü vs gemi spesifikasyonu
   - Ekipman gereksinimleri

5. **Ekonomik Değerlendirme** (5 puan)
   - Ballast maliyeti
   - Konumlandırma giderleri

### Skor Aralıkları

- **90-100**: EXCELLENT (Mükemmel eşleştirme)
- **80-89**: GOOD (İyi eşleştirme)
- **65-79**: FAIR (Orta eşleştirme)
- **0-64**: POOR (Zayıf eşleştirme)

---

## 📋 Örnek Kullanım Senaryoları

### Senaryo 1: Yeni Email Geldiğinde
1. IMAP servisi yeni email yakalar
2. AI otomatik sınıflandırır (CARGO/VESSEL)
3. Structured data çıkarır
4. İlgili tabloya kayıt oluşturur
5. Email InboundEmail tablosuna kaydedilir

### Senaryo 2: Manuel Eşleştirme
1. Frontend'den cargo/vessel listesini al
2. Kullanıcı eşleştirme seçer
3. AI analiz eder (/matches/analyze)
4. Sonucu kullanıcıya göster
5. Onay durumunda eşleştirme oluştur

### Senaryo 3: Otomatik Eşleştirme
1. Sistem tüm cargo/vessel'leri tarar
2. En iyi eşleştirmeleri bulur
3. Minimum skor kriteri uygular
4. Otomatik eşleştirmeler oluşturur
5. Broker'a bildirim gönderir

---

## 📞 Support & Contact

**Geliştirici:** Claude Code AI Assistant  
**Email:** egehelvaci@gmail.com  
**Documentation:** Generated with Claude Code

---

## 🔄 Version History

**v1.0.0** (2025-08-12)
- Gmail IMAP integration
- AI email classification
- Basic CRUD operations
- JWT authentication

**v2.0.0** (2025-08-12)  
- AI-powered matching system
- Advanced filtering
- Comprehensive APIs
- GPT-4 integration
- Automatic cargo/vessel creation

---

*Bu dokümantasyon, tüm API endpoint'lerini ve kullanım örneklerini içermektedir. Herhangi bir sorunuz için egehelvaci@gmail.com adresine ulaşabilirsiniz.*