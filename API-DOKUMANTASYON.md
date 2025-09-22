# 🚢 Gemi-Yük Otomatik Eşleştirme API Dokümantasyonu

## 📋 Genel Bakış

Bu API, mail dosyalarından gemi ve yük bilgilerini çıkararak otomatik eşleştirme yapan bir sistemdir. Tek bir endpoint ile tüm işlem tamamlanır: dosya yükleme → parsing → eşleştirme → detaylı sonuç.

**Base URL**: `http://localhost:3001`

---

## 🎯 Ana Özellikler

- ✅ **Tek API Çağrısı**: Tüm işlem otomatik
- ✅ **Dosya Desteği**: TXT, DOC, DOCX formatları
- ✅ **Akıllı Parsing**: Regex tabanlı veri çıkarma
- ✅ **Otomatik Eşleştirme**: 5 kriterli algoritma
- ✅ **Detaylı Sonuçlar**: Skor ve gerekçelerle
- ✅ **CORS Desteği**: Frontend entegrasyonu hazır

---

## 📡 API Endpoints

### 1. Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-09-22T19:38:26.491Z"
}
```

### 2. Test Endpoint
```http
GET /api/auto-match/test
```

**Response:**
```json
{
  "success": true,
  "message": "Basit Gemi-Yük Eşleştirme API hazır",
  "usage": "POST /api/auto-match ile TXT dosyası yükleyebilirsiniz"
}
```

### 3. 🎯 Ana Eşleştirme Endpoint

```http
POST /api/auto-match
Content-Type: multipart/form-data
```

**Request Parameters:**

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `file` | File | ✅ | TXT/DOCX mail dosyası |
| `minMatchScore` | Number | ❌ | Minimum eşleşme skoru (varsayılan: 60) |
| `maxLaycanGapDays` | Number | ❌ | Max laycan farkı (varsayılan: 5) |

**Örnek Request (cURL):**
```bash
curl -X POST http://localhost:3001/api/auto-match \
  -F "file=@mail-export.txt" \
  -F "minMatchScore=70" \
  -F "maxLaycanGapDays=3"
```

**Örnek Request (JavaScript):**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('minMatchScore', '70');

const response = await fetch('http://localhost:3001/api/auto-match', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

---

## 📤 Response Formatı

### Başarılı Response:
```json
{
  "success": true,
  "message": "2 eşleşme bulundu",
  "data": {
    "summary": {
      "fileName": "mail-export.txt",
      "processingTime": "15ms",
      "vesselsFound": 2,
      "cargosFound": 3,
      "totalMatches": 2
    },
    "vessels": [
      {
        "name": "LADY LEYLA",
        "dwt": 10700,
        "currentPort": "CASABLANCA",
        "laycanStart": "06-08",
        "laycanEnd": "06-08",
        "grainCuft": 400000,
        "speedKnots": 12,
        "features": ["geared"]
      }
    ],
    "cargos": [
      {
        "reference": "30,000 MT WHEAT",
        "quantity": 30000,
        "loadPort": "CHORNOMORSK",
        "laycanStart": "15-20",
        "laycanEnd": "15-20",
        "stowageFactorValue": 46,
        "requirements": ["geared"]
      }
    ],
    "matches": [
      {
        "vessel": {
          "name": "LADY LEYLA",
          "dwt": 10700
        },
        "cargo": {
          "reference": "30,000 MT WHEAT",
          "quantity": 30000
        },
        "matchScore": 85,
        "recommendation": "Çok İyi Eşleşme",
        "reason": "Tonaj uyumu: 75%; Gereksinimler uygun"
      }
    ],
    "recommendations": {
      "bestMatches": [
        {
          "vessel": "LADY LEYLA",
          "cargo": "30,000 MT WHEAT",
          "score": 85,
          "reason": "Tonaj uyumu: 75%; Gereksinimler uygun"
        }
      ]
    }
  }
}
```

### Hata Response:
```json
{
  "success": false,
  "message": "Dosya yüklenmedi",
  "error": "No file uploaded"
}
```

---

## 🔍 Mail Parsing Özellikleri

### Gemi Bilgileri Çıkarma:
- **Gemi Adı**: `M/V LADY LEYLA`, `VESSEL: SHIP NAME`
- **DWT**: `10,700 MT`, `DWT: 25000`, `25K DWT`
- **Açık Liman**: `OPEN: CASABLANCA`, `POSITION: ISTANBUL`
- **Laycan**: `06-08 OCT`, `LAYCAN: 15/20 SEP`
- **Kapasite**: `GRAIN: 400,000 CUFT`, `BALE: 350K CUFT`
- **Hız**: `12 KNOTS`, `SPEED: 13.5 KTS`
- **Özellikler**: `GEARED`, `BOX HOLD`, `OPEN HATCH`

### Yük Bilgileri Çıkarma:
- **Yük Miktarı**: `30,000 MT WHEAT`, `25K MTONS CORN`
- **Yükleme Limanı**: `EX ODESSA`, `FROM: CHORNOMORSK`
- **Laycan**: `15-20 OCT`, `LAYCAN: 25/30 SEP`
- **SF**: `SF: 46 CUFT/MT`, `STOWAGE: 52 CBM/MT`
- **Gereksinimler**: `GEARED REQUIRED`, `BOX HOLD ONLY`

---

## ⚙️ Eşleştirme Algoritması

### 5 Ana Kriter:

1. **Tonaj Uyumu (30 puan)**
   - Yük ≤ Gemi DWT
   - Yük ≥ Gemi DWT × 0.65 (min %65 doluluk)

2. **Liman Uyumu (25 puan)**
   - Açık liman ↔ Yükleme limanı benzerliği
   - String matching ile kontrol

3. **Laycan Uyumu (20 puan)**
   - Tarih aralıkları mevcut mu?
   - Çakışma kontrolü

4. **Gereksinimler (15 puan)**
   - Yükün ihtiyaçları gemide var mı?
   - GEARED, BOX HOLD, vb.

5. **Hacim Kontrolü (10 puan)**
   - SF × Yük miktarı ≤ Gemi kapasitesi
   - Broken stowage %5 eklenir

### Skor Değerlendirme:
- **90-100**: Mükemmel Eşleşme
- **80-89**: Çok İyi Eşleşme  
- **70-79**: İyi Eşleşme
- **60-69**: Kabul Edilebilir
- **<60**: Eşleşme yok

---

## 📝 Örnek Mail Formatları

### Gemi Maili:
```
Subject: MV LADY LEYLA - OPEN CASABLANCA

Dear Sirs,

Pls find details of our vessel as follows:

M/V LADY LEYLA
DWT: 10,700 MT ON 9.5M SSW
GRAIN: 400,000 CUFT
OPEN: CASABLANCA 06-08 OCT
GEARED WITH 2X30T CRANES
SPEED: 12 KNOTS

Best regards,
Shipowner
```

### Yük Maili:
```
Subject: 30K WHEAT CHORNOMORSK TO EGYPT

Dear All,

We have cargo available:

CARGO: 30,000 MT WHEAT
EX: CHORNOMORSK
LAYCAN: 15-20 OCT
SF: 46 CUFT/MT
GEARED REQUIRED

Best regards,
Charterer
```

---

## 🚀 Hızlı Başlangıç

### 1. Server'ı Başlat:
```bash
node simple-server.js
```

### 2. Test Et:
```bash
# Health check
curl http://localhost:3001/health

# Test endpoint
curl http://localhost:3001/api/auto-match/test

# Dosya yükle ve eşleştir
curl -X POST http://localhost:3001/api/auto-match \
  -F "file=@test-mail.txt"
```

### 3. Test Script'i Çalıştır:
```bash
node test-api.js
```

---

## ⚠️ Sınırlamalar

- **Dosya Boyutu**: Maksimum 50MB
- **Dosya Formatları**: TXT, DOC, DOCX
- **Parsing**: Regex tabanlı (İngilizce mail formatları)
- **Veritabanı**: Şu an kullanılmıyor (gelecekte eklenecek)

---

## 🔧 Geliştirme Notları

### Dosya Yapısı:
```
📁 chataring-backend/
├── simple-server.js      # Ana server dosyası
├── test-api.js          # Test script'i
├── test-mail.txt        # Örnek mail dosyası
├── uploads/             # Geçici dosya klasörü
└── src/                 # TypeScript implementasyonu (WIP)
```

### Gelecek Özellikler:
- [ ] PostgreSQL veritabanı entegrasyonu
- [ ] Gelişmiş NLP tabanlı parsing
- [ ] Mesafe hesaplama (Haversine)
- [ ] Çoklu dil desteği
- [ ] WebSocket real-time updates
- [ ] Dashboard UI

---

## 📞 Destek

Herhangi bir sorun için:
- **GitHub**: [Repository Link]
- **Email**: developer@example.com

---

**Son Güncelleme**: 22 Eylül 2025  
**API Versiyonu**: 1.0.0  
**Status**: ✅ Çalışıyor
