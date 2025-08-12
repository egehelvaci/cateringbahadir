# PRD — Broker & Chartering Backend (OpenAI Entegrasyonlu)

**Durum:** Draft v1.0  
**Sahip:** Backend  
**Amaç:** E-posta bazlı yük/gemi bilgilerinin çıkarımı, normalize edilmesi ve AI tabanlı eşleştirme motoru ile Top-3 öneri üretimi.  
**Stack:** Node.js (Express), Prisma, PostgreSQL (Railway), OpenAI (`gpt-4o-mini`, `text-embedding-3-small`)

---

## 1) Arka Plan & Problem

Gemi/yük brokerliği operasyonlarında e-postalar farklı formatlarda gelir. Manuel ayrıştırma zaman alır ve hataya açıktır. Standart bir şema yoktur. Bu proje:
- E-postayı **tek adımda** CARGO **veya** VESSEL JSON’una çevirir (OpenAI Structured Outputs).
- Veriyi normalize edip PostgreSQL’e yazar.
- **Embedding + kural** tabanlı skorla **Top-3 eşleşme** önerir.
- Kullanıcı seçimini kaydeder, public API ile tüketilebilir hale getirir.

---

## 2) Hedefler (Goals)

1. **Extraction güvenilirliği:** Mail metninden tek bir (CARGO **veya** VESSEL) JSON, **şemaya %100 uyumlu**.
2. **Kaydetme & normalize:** Port adları, tarihler, miktar birimleri normalize edilerek DB’ye yazılır.
3. **Eşleştirme motoru:** Embedding benzerlik (cosine) + kural skorları ile **0–100** arası toplam skor ve **Top-3** öneri.
4. **API kontratları:** `/extract`, `/emails/ingest`, `/matches`, `/matches/select`, listeleme uçları.
5. **Operasyonel kalite:** Loglama, hata yönetimi, oran sınırlama (rate limit), sürümleme (v1), testler.

**Non-goals (kapsam dışı):**
- UI/Frontend (ayrı sprint)
- E-posta kutusundan otomatik çekme (IMAP/Gmail) — ilk sürümde dışarıdan içerik verilecek; sonraki sürüm task.

---

## 3) Yüksek Seviye Mimari

Client (Postman/Frontend)
|
v
Express API (Node 20+)
├── /extract → OpenAI(gpt-4o-mini) → Structured Output(JSON)
├── /emails/ingest → DB insert + embedding
├── /matches (Top-3) → embedding+rules
└── /matches/select → seçimi kaydet
|
v
PostgreSQL (Railway) + Prisma
├── cargos, vessels, matches
└── embeddings (pgvector veya BYTEA/JSON fallback)

bash
Copy
Edit

**Konfig (.env):**
OPENAI_API_KEY=...
DATABASE_URL="postgresql://...@maglev.proxy.rlwy.net:32129/railway"
OPENAI_EXTRACT_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
EXTRACTION_TEMPERATURE=0
SERVICE_NAME=broker-backend
PORT=3000

kotlin
Copy
Edit

---

## 4) Veri Modeli (Prisma)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model InboundEmail {
  id          Int       @id @default(autoincrement())
  messageId   String?   @unique
  fromAddr    String?
  subject     String?
  receivedAt  DateTime?
  raw         String?
  parsedType  MailType?
  parsedJson  Json?
  createdAt   DateTime  @default(now())
}

enum MailType { CARGO VESSEL }

model Cargo {
  id            Int       @id @default(autoincrement())
  commodity     String
  qtyValue      Float?
  qtyUnit       String?
  loadPort      String?
  dischargePort String?
  laycanStart   DateTime?
  laycanEnd     DateTime?
  notes         String?
  embedding     Bytes?
  createdAt     DateTime  @default(now())
  matches       Match[]
}

model Vessel {
  id            Int       @id @default(autoincrement())
  name          String?
  imo           String?
  dwt           Float?
  capacityTon   Float?
  capacityM3    Float?
  currentArea   String?
  availableFrom DateTime?
  gear          String?
  notes         String?
  embedding     Bytes?
  createdAt     DateTime  @default(now())
  matches       Match[]
}

model Match {
  id         Int      @id @default(autoincrement())
  cargoId    Int
  vesselId   Int
  score      Float
  reason     Json?
  status     MatchStatus @default(SUGGESTED)
  selected   Boolean  @default(false)
  createdAt  DateTime @default(now())

  cargo   Cargo  @relation(fields: [cargoId], references: [id])
  vessel  Vessel @relation(fields: [vesselId], references: [id])

  @@index([cargoId])
  @@index([vesselId])
}

enum MatchStatus { SUGGESTED ACCEPTED REJECTED }
5) Extraction (OpenAI Structured Outputs)
Amaç: Tek bir JSON döndür (CARGO veya VESSEL).
Hata Yönetimi:

OpenAI 5xx → exponential backoff (3 deneme).

Parse hatası → fallback slice + yeniden parse.

Şema validasyonu geçmezse 422 döndür.

6) Normalize & Doğrulama
Miktar: 25k → 25000, cbm → m3.

Tarih: YYYY-MM-DD; tek tarih varsa laycanStart=laycanEnd.

Port: şimdilik string; v2’de ports tablosu.

7) Embedding & Eşleştirme
Metin oluşturma: cargo/vessel alanları birleştirilerek embedding üretilir.

Model: text-embedding-3-small (1536d).

Skor: cosine benzerlik (0–20 puan) + tarih (0–30) + kapasite (0–25) + coğrafya (0–15) + kısıtlar (0–10).

8) API Tasarımı
POST /extract
Girdi: emailText

Çıktı: { ok:true, type:"CARGO", parsed:{...} }

POST /emails/ingest
Extraction + normalize + DB insert + embedding

Çıktı: { ok:true, entity:"CARGO", id:123 }

GET /cargos & /vessels
Pagination & search destekli listeleme.

GET /matches?cargoId=123
Top-3 eşleşme döner, matches tablosuna kaydeder.

POST /matches/select
{ matchId, accept:true|false } ile seçim yapar.

9) Hata Yönetimi
OpenAI hataları → retry.

Parse hatası → 422.

Aynı messageId tekrar ingest edilirse duplicate flag.

10) Güvenlik
API key sadece backend’de.

CORS whitelist.

Input max 32KB.

11) Deploy
Dev: local Node + Railway DB.

Prod: Railway/Render.

Sağlık kontrolü: /health

12) Test Planı
Unit: extraction, normalize, scoring.

Integration: ingest + match flow.

Fixture: 20+ örnek mail.

13) Yol Haritası
MVP

Temel endpoint’ler

Prisma migration

Basit skor algoritması

v1

Port alias sözlüğü

Telemetri

v1.1

IMAP/Gmail ingest

pgvector entegrasyonu

14) Kabul Kriterleri
/extract → tek obje, şemaya uyumlu.

/emails/ingest → doğru tabloya insert, embedding üretimi.

/matches → mantıklı skorlar.

/matches/select → tek accepted, diğerleri rejected.

15) Yapılacaklar (To-Do)
 Prisma şema oluşturma ve migrate

 OpenAI client + structured output wrapper

 /extract endpoint

 /emails/ingest endpoint

 Embedding servis

 /matches hesaplama ve kaydetme

 /matches/select endpoint

 Rate limit & logging

 Unit & integration testler

16) Yapılanlar (Done)
 PRD dokümanı hazırlandı

 Veri modeli tasarlandı (Prisma schema)

