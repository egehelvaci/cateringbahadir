# Brookering / Chartering AI Matchmaking Backend

AI destekli gemi ve yük eşleştirme backend sistemi.

## Özellikler

- **Gmail OAuth 2.0 Entegrasyonu** (OAuth2 ile güvenli Gmail erişimi)
- **OpenAI API Entegrasyonu** (GPT-4o-mini & text-embedding-3-small)
- **AI Email Extraction** (Structured outputs ile CARGO/VESSEL parsing)
- **Embedding + Rule Based Matching** (0-100 puan sistemi ile Top-3 öneriler)
- **RESTful API** (Extract, Ingest, Match, Select endpoint'leri)
- **Auto Gmail Polling** (Configurable interval ile otomatik email çekme)
- **PostgreSQL veritabanı** (Prisma ORM ile)

## Kurulum

### Gereksinimler

- Node.js 18+
- PostgreSQL 14+ (pgvector extension)
- Redis
- Ollama (AI model için)

### Adımlar

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. `.env` dosyasını düzenleyin

3. Veritabanını hazırlayın:
```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Ollama'yı başlatın ve modeli indirin:
```bash
ollama pull llama3.1:8b-instruct-q4_0
```

5. Redis'i başlatın:
```bash
redis-server
```

6. Uygulamayı başlatın:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Yeni kullanıcı kaydı
- `POST /api/auth/login` - Kullanıcı girişi

### Vessels
- `GET /api/vessels` - Gemi listesi
- `GET /api/vessels/:id` - Gemi detayı
- `POST /api/vessels` - Yeni gemi ekle
- `PUT /api/vessels/:id` - Gemi güncelle
- `DELETE /api/vessels/:id` - Gemi sil

### Cargos
- `GET /api/cargos` - Yük listesi
- `GET /api/cargos/:id` - Yük detayı
- `POST /api/cargos` - Yeni yük ekle
- `PUT /api/cargos/:id` - Yük güncelle
- `DELETE /api/cargos/:id` - Yük sil

### Matches
- `GET /api/matches` - Eşleşme listesi
- `GET /api/matches/:id` - Eşleşme detayı
- `PATCH /api/matches/:id/status` - Eşleşme durumu güncelle
- `POST /api/matches/generate` - Yeni eşleşmeler oluştur

### Gmail Integration
- `GET /api/auth/google` - Gmail OAuth başlatma
- `GET /api/oauth2/callback` - OAuth callback
- `POST /api/gmail/pull` - Gmail'den yeni mesajları çek
- `GET /api/gmail/messages/:email` - Gmail mesajlarını listele
- `GET /api/gmail/messages/:email/:messageId` - Belirli mesaj detayları
- `GET /api/gmail/status/:email` - Gmail hesap durumu
- `DELETE /api/gmail/revoke` - Gmail erişimini iptal et

### Emails
- `GET /api/emails` - Email listesi
- `POST /api/emails/fetch` - Yeni emailleri çek
- `POST /api/emails/process/:id` - Email'i işle

## Scripts

- `npm run dev` - Development server
- `npm run build` - Production build
- `npm start` - Production server2
- `npm test` - Testleri çalıştır
- `npm run prisma:studio` - Prisma Studio'yu aç

## Mimari

```
src/
├── config/         # Konfigürasyon dosyaları
├── controllers/    # Route controllers
├── middleware/     # Express middleware
├── routes/         # API routes
├── services/       # Business logic
├── utils/          # Yardımcı fonksiyonlar
├── workers/        # Background jobs
└── index.ts        # Ana server dosyası
```

## Lisans

ISC