# Gemi-Yük Eşleştirme Sistemi - Product Requirements Document (PRD)

## 1. Genel Bakış

### 1.1 Proje Özeti
Bu sistem, mail export'tan alınan e-postaları analiz ederek içindeki gemi ve yük bilgilerini çıkaracak ve belirli kriterler doğrultusunda otomatik eşleştirme yapacak bir uygulamadır. Sistem, broker ve armatörlerin manuel filtreleme ihtiyacını ortadan kaldırarak operasyonel verimliliği artırmayı hedefler.

### 1.2 Hedefler
- Export edilen mail dosyalarından (TXT/DOCX) gemi ve yük bilgilerini otomatik çıkarma
- Kriterlere uygun gemi-yük eşleştirmelerini bulma
- Manuel filtreleme ihtiyacını minimuma indirme
- Hızlı ve doğru eşleştirme sonuçları sunma

### 1.3 Kapsam
- Mail parsing ve veri çıkarma
- Gemi/yük veritabanı yönetimi
- Eşleştirme algoritması
- API endpoint'leri
- Raporlama ve sonuç görüntüleme

## 2. Fonksiyonel Gereksinimler

### 2.1 Mail İşleme Modülü

#### 2.1.1 Mail Import
- **Giriş**: TXT veya DOCX formatında export edilmiş mail dosyaları
- **İşlem**: 
  - Dosya yükleme API'si
  - Format validasyonu
  - Mail içeriğini parse etme
  - Gemi ve yük bilgilerini tanımlama

#### 2.1.2 Veri Çıkarma (Data Extraction)
- **Gemi Bilgileri**:
  - Gemi adı
  - DWT (Deadweight tonnage)
  - Açıldığı liman
  - Laycan (başlangıç/bitiş tarihleri)
  - Grain/Bale kapasitesi (cuft)
  - Özellikler (box hold, open hatch, geared, heavy gear vb.)
  - Ortalama hız (knots)

- **Yük Bilgileri**:
  - Yük referansı/açıklaması
  - Yük miktarı (metric ton)
  - Yükleme limanı
  - Laycan (başlangıç/bitiş tarihleri)
  - Stowage factor (SF)
  - Broken stowage yüzdesi
  - Özel gereksinimler

### 2.2 Eşleştirme Algoritması

#### 2.2.1 Eşleştirme Kriterleri

1. **Tonaj Uyumu**
   - Yük miktarı ≤ Gemi DWT
   - Yük miktarı ≥ Gemi DWT × 0.65 (gemi en fazla %35 büyük olabilir)
   - Tolerans: ±1 metric ton

2. **Laycan Uyumu**
   - Gemi ve yük laycan aralıkları arasında maksimum 3 gün fark
   - Tarih aralıkları çakışıyorsa fark = 0

3. **Mesafe Uyumu**
   - Geminin açıldığı liman → Yükleme limanı arası seyir süresi ≤ 2 gün
   - Hesaplama: Haversine formülü + rota faktörü (1.20)
   - Varsayılan hız: 12 knots (belirtilmemişse)

4. **Küp/SF Kontrolü**
   - Gerekli hacim = Yük (mt) × SF × (1 + broken stowage %)
   - SF birimi m³/mt ise: 1 m³ = 35.3147 cuft dönüşümü
   - Gemi kapasitesi (grain/bale cuft) ≥ Gerekli hacim

5. **Özel Gereksinimler**
   - Yükün gereksinimleri geminin özelliklerinde bulunmalı
   - Örnek: Yük "box hold" istiyorsa, gemi özellikleri "box" içermeli

#### 2.2.2 Eşleştirme Süreci
1. Tüm aktif gemi ve yükleri al
2. Her gemi-yük çifti için:
   - Sırayla tüm kriterleri kontrol et
   - Herhangi bir kriter sağlanmazsa → eşleşme elenir
   - Tüm kriterler sağlanırsa → uygun eşleşme olarak kaydet
3. Sonuçları puanla ve sırala

### 2.3 Veritabanı Gereksinimleri

#### 2.3.1 Yeni Tablolar

```prisma
model Vessel {
  id            BigInt      @id @default(autoincrement())
  name          String
  dwt           Float       // metric tons
  grainCuft     Float?      // cubic feet
  baleCuft      Float?      // cubic feet
  speedKnots    Float       @default(12.0)
  features      Json?       // ["box", "open_hatch", "geared", etc.]
  currentPort   String?
  laycanStart   DateTime?
  laycanEnd     DateTime?
  status        VesselStatus @default(AVAILABLE)
  sourceEmailId Int?        // Hangi emailden parse edildi
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  
  matches       VesselCargoMatch[]
  
  @@index([status])
  @@index([laycanStart, laycanEnd])
}

model Cargo {
  id                  BigInt      @id @default(autoincrement())
  reference           String      // Yük referansı/açıklaması
  loadPort            String
  laycanStart         DateTime
  laycanEnd           DateTime
  quantity            Float       // metric tons
  stowageFactorValue  Float?
  stowageFactorUnit   String      @default("cuft/mt") // "cuft/mt" veya "m3/mt"
  brokenStowagePct    Float       @default(5.0)
  requirements        Json?       // ["box", "open_hatch", etc.]
  status              CargoStatus @default(AVAILABLE)
  sourceEmailId       Int?        // Hangi emailden parse edildi
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
  
  matches             VesselCargoMatch[]
  
  @@index([status])
  @@index([laycanStart, laycanEnd])
}

model VesselCargoMatch {
  id              BigInt          @id @default(autoincrement())
  vesselId        BigInt
  cargoId         BigInt
  matchScore      Float           // Eşleşme skoru (0-100)
  matchReasons    Json            // Detaylı eşleşme bilgileri
  status          MatchStatus     @default(PROPOSED)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  
  vessel          Vessel          @relation(fields: [vesselId], references: [id])
  cargo           Cargo           @relation(fields: [cargoId], references: [id])
  
  @@unique([vesselId, cargoId])
  @@index([status])
  @@index([matchScore])
}

model Port {
  id          BigInt    @id @default(autoincrement())
  name        String    @unique
  alternateNames Json?  // ["Chornomorsk", "Illichivsk", etc.]
  country     String
  latitude    Float
  longitude   Float
  type        String?   // "seaport", "river", etc.
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  @@index([name])
}

enum VesselStatus {
  AVAILABLE
  FIXED      // Sabitlendi
  INACTIVE
}

enum CargoStatus {
  AVAILABLE
  FIXED      // Sabitlendi
  CANCELLED
}

enum MatchStatus {
  PROPOSED   // Önerilen
  ACCEPTED   // Kabul edildi
  REJECTED   // Reddedildi
  EXPIRED    // Süresi doldu
}
```

### 2.4 API Endpoint'leri

#### 2.4.1 Mail İşleme
```
POST /api/vessel-cargo/import-mail
Body: {
  fileName: string,      // Export edilen dosya adı
  processType: "full" | "incremental"
}
Response: {
  vesselsFound: number,
  cargosFound: number,
  processingTime: number
}
```

#### 2.4.2 Eşleştirme
```
POST /api/vessel-cargo/match
Body: {
  vesselIds?: number[],  // Opsiyonel: Belirli gemiler
  cargoIds?: number[],   // Opsiyonel: Belirli yükler
  criteria?: {
    maxLaycanGapDays?: number,    // Varsayılan: 3
    maxDistanceDays?: number,     // Varsayılan: 2
    maxOversizeRatio?: number,    // Varsayılan: 0.35
    routeFactor?: number          // Varsayılan: 1.20
  }
}
Response: {
  matches: [{
    id: number,
    vessel: VesselDTO,
    cargo: CargoDTO,
    matchScore: number,
    matchDetails: {
      tonnageMatch: boolean,
      laycanMatch: boolean,
      distanceMatch: boolean,
      cubicMatch: boolean,
      requirementsMatch: boolean,
      sailingDays?: number,
      laycanGapDays?: number
    }
  }],
  totalMatches: number
}
```

#### 2.4.3 Gemi CRUD
```
GET    /api/vessels?status=AVAILABLE&laycanFrom=2025-01-01&laycanTo=2025-01-31
POST   /api/vessels
PUT    /api/vessels/:id
DELETE /api/vessels/:id
```

#### 2.4.4 Yük CRUD
```
GET    /api/cargos?status=AVAILABLE&loadPort=Odessa
POST   /api/cargos
PUT    /api/cargos/:id
DELETE /api/cargos/:id
```

#### 2.4.5 Liman Yönetimi
```
GET    /api/ports?search=Gemlik
POST   /api/ports
PUT    /api/ports/:id
GET    /api/ports/calculate-distance?from=Gemlik&to=Odessa
```

## 3. Teknik Gereksinimler

### 3.1 Mail Parsing Stratejileri

#### 3.1.1 Pattern Recognition
- Regex tabanlı veri çıkarma
- NLP (Natural Language Processing) desteği
- Öğrenen sistem (başarılı parse'ları kaydet)

#### 3.1.2 Örnek Patterns
```typescript
// Gemi patterns
const vesselPatterns = {
  name: /M[\/.]?V\s+([A-Z\s]+)\s*(?:\/|,|\n)/i,
  dwt: /(\d{1,3}[,.]?\d{3})\s*(?:MT|DWT|DWCC)/i,
  openPort: /OPEN\s+([A-Z\s]+)\s*(?:\/|,|\n)/i,
  laycan: /LAYCAN[:\s]+(\d{1,2}[-\/]\d{1,2})\s*[-\/]\s*(\d{1,2}[-\/]\d{1,2})/i,
  grain: /GRAIN[:\s]+(\d{1,3}[,.]?\d{3})\s*(?:CUFT|CBM)/i
};

// Yük patterns
const cargoPatterns = {
  quantity: /(\d{1,3}[,.]?\d{3})\s*(?:MT|MTONS)\s+([A-Z]+)/i,
  loadPort: /(?:EX|FROM|LOAD)\s+([A-Z\s]+)\s*(?:\/|TO|\n)/i,
  laycan: /LAYCAN[:\s]+(\d{1,2}[-\/]\d{1,2})\s*[-\/]\s*(\d{1,2}[-\/]\d{1,2})/i,
  sf: /SF[:\s]+(\d+(?:\.\d+)?)\s*(?:CUFT\/MT|M3\/MT)/i
};
```

### 3.2 Performans Gereksinimleri
- Mail import: 1000 mail/dakika
- Eşleştirme: 10.000 gemi × 10.000 yük < 5 saniye
- API response time: < 500ms (ortalama)

### 3.3 Veri Doğrulama
- Liman adları: Port tablosu referansı + fuzzy matching
- Tarih formatları: Çoklu format desteği
- Numerik değerler: Birim dönüşümleri ve validasyon

## 4. Kullanıcı Arayüzü Gereksinimleri

### 4.1 Mail Import Ekranı
- Drag & drop dosya yükleme
- İşleme durumu gösterimi
- Parse edilen veri önizleme
- Hatalı verileri düzeltme imkanı

### 4.2 Eşleştirme Dashboard'u
- Aktif gemi/yük listesi
- Eşleştirme sonuçları tablosu
- Filtreleme ve sıralama
- Detaylı eşleşme bilgileri modal'ı

### 4.3 Raporlama
- Excel/PDF export
- Eşleşme istatistikleri
- Performans metrikleri

## 5. Entegrasyon Noktaları

### 5.1 Mevcut Sistemle Entegrasyon
- `InboundEmail` tablosu ile ilişkilendirme
- Mevcut mail export servisi kullanımı
- Authentication/authorization sistemi

### 5.2 Harici Servisler
- Liman koordinat veritabanları (opsiyonel)
- Gemilerin AIS verileri (opsiyonel)
- Navlun piyasası verileri (opsiyonel)

## 6. Güvenlik Gereksinimleri
- Role-based access control (RBAC)
- Veri şifreleme (hassas ticari bilgiler)
- Audit log (kim hangi eşleştirmeyi ne zaman yaptı)
- Rate limiting

## 7. Test Senaryoları

### 7.1 Mail Parsing Testleri
- Farklı mail formatları
- Eksik veri durumları
- Hatalı format durumları

### 7.2 Eşleştirme Testleri
- Tam uyumlu eşleşmeler
- Kısmi uyumlu eşleşmeler
- Hiç eşleşme olmayan durumlar
- Edge case'ler (sınır değerler)

## 8. Başarı Kriterleri
- %90+ doğru mail parsing oranı
- %95+ doğru eşleştirme oranı
- Manuel kontrol süresinde %80 azalma
- Kullanıcı memnuniyeti skoru > 4.5/5

## 9. Roadmap

### Faz 1: Temel Fonksiyonlar (2-3 hafta)
- Mail import ve basit parsing
- Gemi/yük CRUD işlemleri
- Temel eşleştirme algoritması

### Faz 2: Gelişmiş Özellikler (3-4 hafta)
- Gelişmiş mail parsing (NLP)
- Detaylı eşleştirme kriterleri
- Raporlama ve analytics

### Faz 3: Optimizasyon ve Entegrasyonlar (2-3 hafta)
- Performans optimizasyonları
- Harici servis entegrasyonları
- Mobil uygulama desteği

## 10. Riskler ve Azaltma Stratejileri

### Risk 1: Mail Formatı Çeşitliliği
- **Risk**: Farklı broker/armatörlerin farklı mail formatları
- **Azaltma**: Öğrenen sistem, manuel düzeltme imkanı

### Risk 2: Liman İsim Uyuşmazlıkları
- **Risk**: Aynı limanın farklı yazılışları
- **Azaltma**: Alias sistemi, fuzzy matching

### Risk 3: Performans Sorunları
- **Risk**: Büyük veri setlerinde yavaşlama
- **Azaltma**: İndeksleme, cache mekanizması, pagination

## 11. Ekler

### Ek A: Örnek Mail Formatları
```
Subject: MV LADY LEYLA - OPEN CASABLANCA 

Dear Sirs,

Pls find details of our vessel as follows:

M/V LADY LEYLA
DWT: 10,700 MT ON 9.5M SSW
GRAIN: 400,000 CUFT
OPEN: CASABLANCA 06-08 OCT
GEARED WITH 2X30T CRANES

Best regards,
Shipowner
```

### Ek B: Liman Koordinat Listesi
- Gemlik: 40.43°N, 29.15°E
- Odessa: 46.49°N, 30.73°E
- Alexandria: 31.20°N, 29.92°E
- (Tam liste Port tablosunda)

### Ek C: Birim Dönüşümleri
- 1 m³ = 35.3147 cuft
- 1 NM (nautical mile) = 1.852 km
- Rota faktörü: Genelde 1.15-1.25 arası

---

Bu PRD, gemi-yük eşleştirme sisteminin tüm yönlerini kapsamaktadır. Geliştirme sürecinde detaylar güncellenebilir ve genişletilebilir.
