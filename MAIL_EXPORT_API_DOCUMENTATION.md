# Mail Export API - Kapsamlı Teknik Dokümantasyon

## İçindekiler
1. [Genel Bakış](#genel-bakış)
2. [Sistem Gereksinimleri](#sistem-gereksinimleri)
3. [API Endpoint'leri](#api-endpointleri)
4. [Veri Modelleri](#veri-modelleri)
5. [Filtreleme Sistemi](#filtreleme-sistemi)
6. [Hata Yönetimi](#hata-yönetimi)
7. [Güvenlik](#güvenlik)
8. [Performans](#performans)
9. [Kullanım Örnekleri](#kullanım-örnekleri)
10. [Troubleshooting](#troubleshooting)
11. [Changelog](#changelog)

---

## Genel Bakış

Mail Export API, mevcut mail filtreleme sistemini kullanmadan, gelen mailleri düzgün bir formatta TXT dosyası olarak export etmenizi sağlar. Bu API, tarih, saat ve diğer filtrelerle mail verilerini filtreleyerek, işlenmiş ve ham verileri içeren kapsamlı raporlar oluşturur.

### Temel Özellikler
- ✅ **Filtreleme Sistemi**: Tarih, saat, gönderen, konu bazlı filtreleme
- ✅ **TXT Export**: Düzgün formatlanmış, okunabilir TXT dosyaları
- ✅ **Ham Veri Desteği**: Opsiyonel ham email içeriği dahil etme
- ✅ **İstatistik Raporları**: Export işlemleri hakkında detaylı istatistikler
- ✅ **Dosya Yönetimi**: Export dosyalarını listeleme ve indirme
- ✅ **Rate Limiting**: API kullanımını sınırlama
- ✅ **Authentication**: Güvenli erişim kontrolü

### API Versiyonu
- **Mevcut Versiyon**: v1.0.0
- **Base URL**: `http://localhost:3000/api/mail-export`
- **Content-Type**: `application/json`
- **Authentication**: Bearer Token

---

## Sistem Gereksinimleri

### Sunucu Gereksinimleri
- **Node.js**: v18.0.0 veya üzeri
- **TypeScript**: v4.9.0 veya üzeri
- **Express.js**: v4.18.0 veya üzeri
- **Prisma**: v5.0.0 veya üzeri
- **PostgreSQL**: v13.0 veya üzeri

### Disk Gereksinimleri
- **Export Dizini**: `./exports/` (otomatik oluşturulur)
- **Minimum Disk Alanı**: 1GB (export dosyaları için)
- **Dosya Saklama**: Manuel temizlik gerekir

### Bağımlılıklar
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "prisma": "^5.0.0",
    "@prisma/client": "^5.0.0",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0"
  }
}
```

---

## API Endpoint'leri

### 1. Mail Export (TXT Format)

**Endpoint**: `POST /export-txt`  
**Açıklama**: Gelen mailleri TXT formatında export eder  
**Authentication**: Gerekli  
**Rate Limit**: 10 request/minute

#### Request Headers
```
Authorization: Bearer <your-token>
Content-Type: application/json
```

#### Request Body
```typescript
interface ExportRequest {
  startDate?: string;        // YYYY-MM-DD format
  endDate?: string;          // YYYY-MM-DD format
  startTime?: string;        // HH:MM format (24 saat)
  endTime?: string;          // HH:MM format (24 saat)
  fromEmail?: string;        // Gönderen email filtresi
  subjectFilter?: string;    // Konu filtresi
  includeRaw?: boolean;      // Ham içeriği dahil et (default: false)
}
```

#### Request Örneği
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "startTime": "09:00",
  "endTime": "17:00",
  "fromEmail": "broker@shipping.com",
  "subjectFilter": "cargo",
  "includeRaw": true
}
```

#### Response
```typescript
interface ExportResponse {
  success: boolean;
  message: string;
  data: {
    fileName: string;        // Export edilen dosya adı
    totalEmails: number;     // Export edilen mail sayısı
    fileSize: number;        // Dosya boyutu (bytes)
    downloadUrl: string;     // İndirme URL'i
  };
  timestamp: string;         // ISO 8601 format
}
```

#### Response Örneği
```json
{
  "success": true,
  "message": "Mail export completed successfully",
  "data": {
    "fileName": "mail-export-2024-01-15T10-30-45-123Z.txt",
    "totalEmails": 150,
    "fileSize": 245760,
    "downloadUrl": "/api/mail-export/download/mail-export-2024-01-15T10-30-45-123Z.txt"
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### 2. Dosya İndirme

**Endpoint**: `GET /download/:fileName`  
**Açıklama**: Export edilmiş TXT dosyasını indirir  
**Authentication**: Gerekli  
**Rate Limit**: 100 request/minute

#### Path Parameters
- **fileName** (string, required): İndirilecek dosya adı

#### Response
- **Content-Type**: `text/plain`
- **Content-Disposition**: `attachment; filename="<fileName>"`
- **Body**: TXT dosyası binary olarak

#### Hata Durumları
- **404**: Dosya bulunamadı
- **403**: Erişim izni yok
- **500**: Sunucu hatası

### 3. Export İstatistikleri

**Endpoint**: `GET /stats`  
**Açıklama**: Export işlemleri hakkında istatistikler döner  
**Authentication**: Gerekli  
**Rate Limit**: 100 request/minute

#### Response
```typescript
interface StatsResponse {
  success: boolean;
  data: {
    totalEmails: number;           // Toplam mail sayısı
    cargoEmails: number;           // Kargo mail sayısı
    vesselEmails: number;          // Gemi mail sayısı
    unprocessedEmails: number;     // İşlenmemiş mail sayısı
    recentExports: Array<{         // Son export dosyaları
      fileName: string;
      size: number;
      created: string;
      modified: string;
    }>;
    exportDirectory: string;       // Export dizini yolu
  };
  timestamp: string;
}
```

### 4. Export Dosyalarını Listele

**Endpoint**: `GET /files`  
**Açıklama**: Mevcut export dosyalarını listeler  
**Authentication**: Gerekli  
**Rate Limit**: 100 request/minute

#### Response
```typescript
interface FilesResponse {
  success: boolean;
  data: Array<{
    fileName: string;      // Dosya adı
    size: number;          // Dosya boyutu (bytes)
    created: string;       // Oluşturulma tarihi
    modified: string;      // Son değiştirilme tarihi
  }>;
  timestamp: string;
}
```

---

## Veri Modelleri

### InboundEmail Model
```typescript
interface InboundEmail {
  id: number;
  messageId?: string;
  fromAddr?: string;
  subject?: string;
  receivedAt?: Date;
  raw?: string;           // Ham email içeriği
  parsedType?: 'CARGO' | 'VESSEL';
  parsedJson?: any;       // İşlenmiş JSON verisi
  gmailId?: string;
  threadId?: string;
  labelIds?: any[];
  historyId?: string;
  createdAt: Date;
}
```

### Export Options
```typescript
interface ExportOptions {
  startDate?: string;      // YYYY-MM-DD
  endDate?: string;        // YYYY-MM-DD
  startTime?: string;      // HH:MM
  endTime?: string;        // HH:MM
  fromEmail?: string;      // Email adresi
  subjectFilter?: string;  // Konu filtresi
  includeRaw?: boolean;    // Ham içerik dahil et
}
```

---

## Filtreleme Sistemi

### Tarih Filtreleri
- **startDate**: Başlangıç tarihi (YYYY-MM-DD format)
- **endDate**: Bitiş tarihi (YYYY-MM-DD format)
- **Kullanım**: `receivedAt` alanına göre filtreleme

### Saat Filtreleri
- **startTime**: Başlangıç saati (HH:MM format, 24 saat)
- **endTime**: Bitiş saati (HH:MM format, 24 saat)
- **Kullanım**: Tarih ile birleştirilerek tam datetime filtreleme

### Metin Filtreleri
- **fromEmail**: Gönderen email adresinde arama (case-insensitive)
- **subjectFilter**: Konu satırında arama (case-insensitive)

### Filtre Kombinasyonları
```typescript
// Sadece tarih
{ startDate: "2024-01-01", endDate: "2024-01-31" }

// Tarih + saat
{ 
  startDate: "2024-01-01", 
  endDate: "2024-01-31",
  startTime: "09:00",
  endTime: "17:00"
}

// Metin filtreleri
{ 
  fromEmail: "broker@shipping.com",
  subjectFilter: "cargo"
}

// Tüm filtreler
{
  startDate: "2024-01-01",
  endDate: "2024-01-31",
  startTime: "09:00",
  endTime: "17:00",
  fromEmail: "broker@shipping.com",
  subjectFilter: "cargo",
  includeRaw: true
}
```

---

## Hata Yönetimi

### HTTP Status Kodları
- **200**: Başarılı
- **400**: Geçersiz request parametreleri
- **401**: Authentication gerekli
- **403**: Erişim izni yok
- **404**: Kaynak bulunamadı
- **429**: Rate limit aşıldı
- **500**: Sunucu hatası

### Hata Response Formatı
```typescript
interface ErrorResponse {
  success: false;
  message: string;
  error?: {
    code: string;
    details?: any;
  };
  timestamp: string;
}
```

### Yaygın Hatalar

#### 400 - Geçersiz Parametreler
```json
{
  "success": false,
  "message": "Invalid date format. Expected YYYY-MM-DD",
  "error": {
    "code": "INVALID_DATE_FORMAT",
    "details": {
      "field": "startDate",
      "value": "01-01-2024",
      "expected": "YYYY-MM-DD"
    }
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

#### 401 - Authentication Gerekli
```json
{
  "success": false,
  "message": "Authentication required",
  "error": {
    "code": "UNAUTHORIZED"
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

#### 429 - Rate Limit Aşıldı
```json
{
  "success": false,
  "message": "Rate limit exceeded. Try again in 60 seconds",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "details": {
      "limit": 10,
      "window": "1 minute",
      "retryAfter": 60
    }
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

---

## Güvenlik

### Authentication
- **Method**: Bearer Token
- **Header**: `Authorization: Bearer <token>`
- **Token Format**: JWT veya custom token
- **Expiration**: Token'a bağlı

### Rate Limiting
- **Export Endpoint**: 10 request/minute per user
- **Other Endpoints**: 100 request/minute per IP
- **Window**: 1 minute sliding window

### Input Validation
- **Date Format**: YYYY-MM-DD (strict)
- **Time Format**: HH:MM (24-hour)
- **Email**: Basic email format validation
- **File Names**: Alphanumeric + hyphens only

### File Security
- **Export Directory**: Restricted access
- **File Names**: Timestamped, unique
- **File Access**: Authentication required
- **File Cleanup**: Manual (automatic cleanup not implemented)

---

## Performans

### Export Performansı
- **Batch Size**: 50 emails per batch
- **Memory Usage**: ~10MB per 1000 emails
- **File Size**: ~1KB per email (without raw content)
- **Processing Time**: ~1 second per 100 emails

### Optimizasyonlar
- **Database Indexing**: `receivedAt`, `fromAddr`, `subject` alanları
- **Streaming**: Large exports için streaming support
- **Caching**: Stats endpoint için 5-minute cache
- **Compression**: TXT dosyaları gzip ile sıkıştırılabilir

### Sınırlamalar
- **Max Export Size**: 10,000 emails per request
- **File Size Limit**: 100MB per export file
- **Concurrent Exports**: 5 per user
- **Storage Limit**: 1GB total export files

---

## Kullanım Örnekleri

### 1. Basit Export
```bash
curl -X POST http://localhost:3000/api/mail-export/export-txt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }'
```

### 2. Çalışma Saatleri Filtresi
```bash
curl -X POST http://localhost:3000/api/mail-export/export-txt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "09:00",
    "endTime": "17:00",
    "includeRaw": true
  }'
```

### 3. Kargo Mailleri Export
```bash
curl -X POST http://localhost:3000/api/mail-export/export-txt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectFilter": "cargo",
    "includeRaw": true
  }'
```

### 4. Belirli Gönderen
```bash
curl -X POST http://localhost:3000/api/mail-export/export-txt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fromEmail": "broker@shipping.com",
    "startDate": "2024-01-01"
  }'
```

### 5. JavaScript/Node.js Kullanımı
```javascript
const axios = require('axios');

async function exportMails() {
  try {
    const response = await axios.post(
      'http://localhost:3000/api/mail-export/export-txt',
      {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        subjectFilter: 'cargo',
        includeRaw: true
      },
      {
        headers: {
          'Authorization': 'Bearer <your-token>',
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Export successful:', response.data);
    
    // Dosyayı indir
    const downloadResponse = await axios.get(
      `http://localhost:3000/api/mail-export/download/${response.data.data.fileName}`,
      {
        headers: {
          'Authorization': 'Bearer <your-token>'
        },
        responseType: 'stream'
      }
    );
    
    // Dosyayı kaydet
    const fs = require('fs');
    const writer = fs.createWriteStream('exported-mails.txt');
    downloadResponse.data.pipe(writer);
    
  } catch (error) {
    console.error('Export failed:', error.response?.data || error.message);
  }
}
```

### 6. Python Kullanımı
```python
import requests
import json

def export_mails():
    url = "http://localhost:3000/api/mail-export/export-txt"
    headers = {
        "Authorization": "Bearer <your-token>",
        "Content-Type": "application/json"
    }
    
    data = {
        "startDate": "2024-01-01",
        "endDate": "2024-01-31",
        "subjectFilter": "cargo",
        "includeRaw": True
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        
        result = response.json()
        print(f"Export successful: {result['data']['totalEmails']} emails")
        
        # Dosyayı indir
        download_url = f"http://localhost:3000/api/mail-export/download/{result['data']['fileName']}"
        download_response = requests.get(download_url, headers=headers)
        download_response.raise_for_status()
        
        with open('exported-mails.txt', 'wb') as f:
            f.write(download_response.content)
            
        print("File downloaded successfully")
        
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
```

---

## Troubleshooting

### Yaygın Sorunlar

#### 1. "File not found" Hatası
**Problem**: Export dosyası bulunamıyor  
**Çözüm**: 
- Dosya adının doğru olduğundan emin olun
- Export işleminin tamamlandığını kontrol edin
- Dosya silinmiş olabilir

#### 2. "Rate limit exceeded" Hatası
**Problem**: Çok fazla request gönderildi  
**Çözüm**: 
- 1 dakika bekleyin
- Request sıklığını azaltın
- Batch işlemler yapın

#### 3. "Invalid date format" Hatası
**Problem**: Tarih formatı yanlış  
**Çözüm**: 
- Tarih formatını YYYY-MM-DD olarak kullanın
- Saat formatını HH:MM olarak kullanın

#### 4. "Authentication required" Hatası
**Problem**: Token eksik veya geçersiz  
**Çözüm**: 
- Authorization header'ını kontrol edin
- Token'ın geçerli olduğundan emin olun
- Yeniden login yapın

#### 5. Export çok yavaş
**Problem**: Büyük veri setleri  
**Çözüm**: 
- Tarih aralığını küçültün
- Filtreleri kullanın
- Batch işlemler yapın

### Debug Modu
```bash
# Debug logları için
export DEBUG=mail-export:*
npm start
```

### Log Dosyaları
- **Location**: `./logs/`
- **Format**: JSON
- **Rotation**: Daily
- **Retention**: 30 days

---

## Changelog

### v1.0.0 (2024-01-15)
- ✅ İlk sürüm yayınlandı
- ✅ TXT export fonksiyonu
- ✅ Tarih/saat filtreleme
- ✅ Metin filtreleme
- ✅ Dosya indirme
- ✅ İstatistik raporları
- ✅ Rate limiting
- ✅ Authentication

### Gelecek Sürümler
- 🔄 CSV export formatı
- 🔄 Excel export formatı
- 🔄 Otomatik dosya temizleme
- 🔄 Email bildirimleri
- 🔄 Scheduled exports
- 🔄 Bulk operations
- 🔄 Advanced filtering
- 🔄 Export templates

---

## Destek

### Teknik Destek
- **Email**: support@company.com
- **Documentation**: [API Docs](http://localhost:3000/docs)
- **Issues**: [GitHub Issues](https://github.com/company/repo/issues)

### Geliştirici Kaynakları
- **Source Code**: [GitHub Repository](https://github.com/company/repo)
- **API Reference**: [Swagger UI](http://localhost:3000/api-docs)
- **Postman Collection**: [Download](https://api.postman.com/collections/...)

---

**Son Güncelleme**: 15 Ocak 2024  
**Dokümantasyon Versiyonu**: v1.0.0  
**API Versiyonu**: v1.0.0
