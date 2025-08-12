# PRD: Brookering / Chartering AI Matchmaking Backend

## 1. Proje Tanımı
Gemi ve yük brokerlik süreçlerinde gelen e-postaların AI ile işlenmesi, yapılandırılmış veriye dönüştürülmesi, kural + embedding tabanlı bir eşleştirme motoru ile **top-3 gemi–yük önerisinin** üretilmesi ve yönetilmesi.  
Backend, Node.js (Express) + TypeScript + Prisma + PostgreSQL ile geliştirilecektir.

## 2. Amaçlar
- IMAP/Gmail API üzerinden **gemi ve yük mailleri** almak.
- Yapay zeka ile e-postalardan **standart JSON veri** çıkarmak.
- Verileri normalize edip veritabanına kaydetmek.
- AI + kural tabanlı **eşleştirme motoru** ile top-3 öneri üretmek.
- API uçları ile yük, gemi, eşleştirme verilerini sunmak.
- Public API üzerinden eşleşmeleri üçüncü taraf sistemlere açmak.

## 3. Teknoloji Stack
- **Dil:** TypeScript
- **Framework:**  Express.js
- **ORM:** Prisma
- **DB:** PostgreSQL (pgvector eklentisi ile embedding)
- **E-posta:** imapflow, googleapis
- **AI:** Ollama (Llama 3.1 8B Instruct), @xenova/transformers (embedding)
- **Queue:** BullMQ + Redis (e-posta işleme)
- **Test:** Jest
- **Deploy:** Railway (Backend), Vercel (Frontend), Sunucu (Ollama)

## 4. Veritabanı Şeması (Prisma Schema)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Company {
  id      BigInt @id @default(autoincrement())
  name    String
  users   User[]
}

model User {
  id         BigInt @id @default(autoincrement())
  companyId  BigInt
  email      String  @unique
  name       String?
  company    Company @relation(fields: [companyId], references: [id])
}

model Port {
  id       BigInt @id @default(autoincrement())
  unlocode String? @unique
  name     String
  country  String?
}

model InboundEmail {
  id           BigInt   @id @default(autoincrement())
  mailboxType  MailboxType
  provider     String?
  messageId    String?   @unique
  fromAddr     String?
  subject      String?
  receivedAt   DateTime?
  raw          String?
  parsed       Json?
  dedupHash    String?   @unique
  createdAt    DateTime  @default(now())
}

model Vessel {
  id            BigInt @id @default(autoincrement())
  name          String?
  imo           String? @unique
  dwt           Int?
  capacityJson  Json?
  currentArea   String?
  availableFrom DateTime?
  gear          GearType?
}

model Cargo {
  id                BigInt @id @default(autoincrement())
  commodity         String
  qtyValue          Float?
  qtyUnit           QtyUnit?
  loadPortId        BigInt?
  dischargePortId   BigInt?
  laycanStart       DateTime?
  laycanEnd         DateTime?
  constraints       Json?
  loadPort          Port? @relation("CargoLoadPort", fields: [loadPortId], references: [id])
  dischargePort     Port? @relation("CargoDischargePort", fields: [dischargePortId], references: [id])
}

model Match {
  id         BigInt @id @default(autoincrement())
  cargoId    BigInt
  vesselId   BigInt
  score      Float
  reason     Json?
  status     MatchStatus @default(SUGGESTED)
  decidedBy  BigInt?
  decidedAt  DateTime?
  cargo      Cargo  @relation(fields: [cargoId], references: [id])
  vessel     Vessel @relation(fields: [vesselId], references: [id])
}

enum MailboxType {
  VESSEL
  CARGO
}

enum GearType {
  geared
  gearless
}

enum QtyUnit {
  ton
  m3
  unit
}

enum MatchStatus {
  SUGGESTED
  ACCEPTED
  REJECTED
}
