# Mail Export API Dokümantasyonu

Bu API, mevcut mail filtreleme sistemini kullanmadan, gelen mailleri düzgün bir formatta TXT dosyası olarak export etmenizi sağlar. Tarih, saat ve diğer filtrelerle mail verilerini filtreleyebilirsiniz.

## Base URL
```
http://localhost:3000/api/mail-export
```

## Authentication
Tüm endpoint'ler authentication gerektirir. Header'da Bearer token kullanın:
```
Authorization: Bearer <your-token>
```

## Endpoints

### 1. Mail Export (TXT Format)

**POST** `/export-txt`

Gelen mailleri TXT formatında export eder.

#### Request Body
```json
{
  "startDate": "2024-01-01",        // Başlangıç tarihi (YYYY-MM-DD)
  "endDate": "2024-12-31",          // Bitiş tarihi (YYYY-MM-DD)
  "startTime": "00:00",             // Başlangıç saati (HH:MM)
  "endTime": "23:59",               // Bitiş saati (HH:MM)
  "fromEmail": "sender@example.com", // Gönderen email filtresi
  "subjectFilter": "cargo",         // Konu filtresi
  "includeRaw": true                // Ham içeriği dahil et (opsiyonel)
}
```

#### Filtre Parametreleri
- **startDate/endDate**: Tarih aralığı (opsiyonel)
- **startTime/endTime**: Saat aralığı (opsiyonel)
- **fromEmail**: Gönderen email adresinde arama (opsiyonel)
- **subjectFilter**: Konu satırında arama (opsiyonel)
- **includeRaw**: Ham email içeriğini TXT'ye dahil et (varsayılan: false)

#### Response
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

**GET** `/download/:fileName`

Export edilmiş TXT dosyasını indirir.

#### Parameters
- **fileName**: İndirilecek dosya adı

#### Response
TXT dosyası binary olarak döner.

### 3. Export İstatistikleri

**GET** `/stats`

Export işlemleri hakkında istatistikler döner.

#### Response
```json
{
  "success": true,
  "data": {
    "totalEmails": 1000,
    "cargoEmails": 450,
    "vesselEmails": 300,
    "unprocessedEmails": 250,
    "recentExports": [
      {
        "fileName": "mail-export-2024-01-15T10-30-45-123Z.txt",
        "size": 245760,
        "created": "2024-01-15T10:30:45.123Z",
        "modified": "2024-01-15T10:30:45.123Z"
      }
    ],
    "exportDirectory": "/path/to/exports"
  },
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### 4. Export Dosyalarını Listele

**GET** `/files`

Mevcut export dosyalarını listeler.

#### Response
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

## TXT Dosya Formatı

Export edilen TXT dosyası şu formatta olur:

```
================================================================================
MAIL EXPORT RAPORU
================================================================================
Export Tarihi: 15.01.2024 13:30:45
Toplam Mail Sayısı: 150
Filtreler:
  - Başlangıç Tarihi: 2024-01-01
  - Bitiş Tarihi: 2024-12-31
  - Başlangıç Saati: 00:00
  - Bitiş Saati: 23:59
  - Gönderen: test@example.com
  - Konu Filtresi: cargo
================================================================================

MAIL 1
----------------------------------------
ID: 123
Gönderen: sender@example.com
Konu: Cargo Inquiry - Steel
Alındığı Tarih: 15.01.2024 10:30:45
Oluşturulma Tarihi: 15.01.2024 10:30:45
Gmail ID: 18c1234567890abc
Thread ID: 18c1234567890abc
İşlenmiş Tip: CARGO
Etiketler: ["INBOX", "IMPORTANT"]

İşlenmiş Veri:
{
  "type": "CARGO",
  "data": {
    "commodity": "Steel",
    "qtyValue": 5000,
    "qtyUnit": "MT",
    "loadPort": "Istanbul",
    "dischargePort": "Hamburg"
  }
}

Ham İçerik:
--------------------
From: sender@example.com
To: recipient@example.com
Subject: Cargo Inquiry - Steel
Date: Mon, 15 Jan 2024 10:30:45 +0000

Dear Sir/Madam,

We have 5000 MT of steel available for loading from Istanbul to Hamburg...
--------------------

================================================================================

ÖZET
========================================
Toplam Mail: 150
Kargo Mailleri: 80
Gemi Mailleri: 45
İşlenmemiş Mailler: 25
En Eski Mail: 01.01.2024 00:00:00
En Yeni Mail: 15.01.2024 13:30:45
```

## Kullanım Örnekleri

### 1. Son 7 Günün Maillerini Export Et
```bash
curl -X POST http://localhost:3000/api/mail-export/export-txt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-08",
    "endDate": "2024-01-15"
  }'
```

### 2. Belirli Saat Aralığındaki Mailleri Export Et
```bash
curl -X POST http://localhost:3000/api/mail-export/export-txt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "09:00",
    "endTime": "17:00"
  }'
```

### 3. Kargo Maillerini Export Et
```bash
curl -X POST http://localhost:3000/api/mail-export/export-txt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectFilter": "cargo",
    "includeRaw": true
  }'
```

### 4. Belirli Gönderenden Gelen Mailleri Export Et
```bash
curl -X POST http://localhost:3000/api/mail-export/export-txt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fromEmail": "broker@shipping.com"
  }'
```

## Hata Kodları

- **400**: Geçersiz request parametreleri
- **401**: Authentication gerekli
- **404**: Dosya bulunamadı
- **429**: Rate limit aşıldı
- **500**: Sunucu hatası

## Rate Limiting

Tüm endpoint'ler rate limiting ile korunur:
- 100 request per minute per IP
- 10 export request per minute per user

## Dosya Saklama

Export edilen dosyalar `exports/` dizininde saklanır. Dosyalar otomatik olarak temizlenmez, manuel olarak silinmesi gerekir.
