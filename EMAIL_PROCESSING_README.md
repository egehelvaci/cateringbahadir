# E-posta Otomatik İşleme ve Sınıflandırma Sistemi

## Sorun
Gelen mailler `InboundEmail` tablosuna kaydediliyordu ancak otomatik olarak cargo ve vessel ayrımı yapılıp bu tablolara yazılmıyordu.

## Çözüm
Sisteme otomatik AI sınıflandırma ve structured data extraction eklendi.

## Nasıl Çalışır

### 1. Otomatik İşleme (Yeni Mailler)
Artık yeni gelen mailler şu şekilde işlenir:

1. **Mail Gelişi**: IMAP veya Gmail API ile mail alınır
2. **AI Sınıflandırma**: `AIClassificationService` mail içeriğini analiz eder
3. **Tür Belirleme**: Mail CARGO veya VESSEL olarak sınıflandırılır (confidence > 0.6 ise)
4. **Structured Data Extraction**: OpenAI ile detaylı veri çıkarımı yapılır
5. **Veritabanı Kaydı**: 
   - `InboundEmail` tablosuna ham mail + sınıflandırma bilgileri
   - `Cargo` veya `Vessel` tablosuna structured data
   - Otomatik embedding generation (matching için)

### 2. Geçmiş Maillerin İşlenmesi
Daha önce işlenmemiş mailleri toplu olarak işlemek için:

```bash
POST /api/emails/process
```

### 3. İstatistikleri Görme
İşleme durumunu kontrol etmek için:

```bash
GET /api/emails/stats
```

## Hangi Servislerde Güncelleme Yapıldı

### 1. Gmail Service (`src/services/gmail.service.ts`)
- AI Classification ve OpenAI Service entegrasyonu
- `saveMessagesToDatabase` metoduna otomatik sınıflandırma eklendi
- `saveToSpecificTable` metodu eklendi

### 2. IMAP Gmail Service (`src/services/imap-gmail.service.ts`)
- OpenAI Service entegrasyonu
- `saveMessagesToDatabase` metoduna otomatik sınıflandırma eklendi
- `saveToSpecificTable` metodu eklendi

### 3. Yeni Email Processing Service (`src/services/email-processing.service.ts`)
- Geçmiş maillerin toplu işlenmesi için ayrı servis
- İstatistik fonksiyonları
- Batch processing

### 4. Yeni Routes (`src/routes/email-processing.routes.ts`)
- Manuel işleme trigger'ı
- İstatistikleri görme endpoint'i

## Güven Seviyesi
- AI Classification confidence > 0.6 olan mailler otomatik işlenir
- Düşük confidence'li mailler sadece InboundEmail'e kaydedilir
- Hata durumunda fallback mekanizması devreye girer

## Log Mesajları
Sistem detaylı log mesajları verir:

```
Successfully classified and saved CARGO from email "Wheat cargo available"
Saved cargo: wheat from Hamburg to Shanghai  
Email classification uncertain (VESSEL, confidence: 0.4)
```

## API Endpoints

### Manuel İşleme
```bash
POST /api/emails/process
Authorization: Bearer <token>

Response:
{
  "success": true,
  "processed": 15,
  "errors": 0,
  "timestamp": "2025-01-12T10:30:00Z"
}
```

### İstatistikler
```bash
GET /api/emails/stats
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "totalEmails": 100,
    "processedEmails": 85,
    "unprocessedEmails": 15,
    "cargoCount": 45,
    "vesselCount": 40
  }
}
```

## Veritabanı Değişiklikleri
`InboundEmail` tablosunda:
- `parsedType`: CARGO/VESSEL/null
- `parsedJson`: AI extraction sonuçları

## Konfigürasyon
`.env` dosyasında gerekli ayarlar:
```
OPENAI_API_KEY=...
OPENAI_EXTRACT_MODEL=gpt-4o-mini
EXTRACTION_TEMPERATURE=0
```

## Monitoring
Sistem otomatik olarak:
- Başarılı işlemeleri loglar
- Hataları yakalar ve devam eder
- İşleme istatistiklerini tutar
- Embedding generation yapar (matching için)
