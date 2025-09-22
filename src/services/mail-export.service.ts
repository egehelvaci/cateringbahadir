import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export interface ExportOptions {
  startDate?: string; // YYYY-MM-DD format
  endDate?: string;   // YYYY-MM-DD format
  startTime?: string; // HH:MM format
  endTime?: string;   // HH:MM format
  fromEmail?: string;
  subjectFilter?: string;
  includeRaw?: boolean;
  format?: 'txt' | 'docx'; // Export format
}

export interface ExportResult {
  fileName: string;
  totalEmails: number;
  fileSize: number;
}

export class MailExportService {
  private exportDir: string;

  constructor() {
    // Export dosyalarını saklamak için dizin oluştur
    this.exportDir = path.join(process.cwd(), 'exports');
    this.ensureExportDir();
  }

  private ensureExportDir(): void {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
      logger.info('Export directory created:', this.exportDir);
    }
  }

  /**
   * Mailleri TXT veya DOCX formatında export et
   */
  async exportEmailsToTxt(options: ExportOptions): Promise<ExportResult> {
    try {
      // Filtreleme koşullarını oluştur
      const whereClause = this.buildWhereClause(options);
      
      logger.info('Fetching emails with filters:', whereClause);

      // Mailleri veritabanından çek
      const emails = await prisma.inboundEmail.findMany({
        where: whereClause,
        orderBy: {
          receivedAt: 'desc'
        }
      });

      logger.info(`Found ${emails.length} emails to export`);

      // Dosya adı oluştur
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const format = options.format || 'txt';
      const extension = format === 'docx' ? 'docx' : 'txt';
      const fileName = `mail-export-${timestamp}.${extension}`;
      const filePath = path.join(this.exportDir, fileName);

      // Format'a göre export et
      if (format === 'docx') {
        await this.exportToWord(emails, options, filePath);
      } else {
        const txtContent = this.generateTxtContent(emails, options);
        fs.writeFileSync(filePath, txtContent, 'utf8');
      }

      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      logger.info(`Export completed: ${fileName} (${fileSize} bytes)`);

      return {
        fileName,
        totalEmails: emails.length,
        fileSize
      };

    } catch (error) {
      logger.error('Error exporting emails to TXT:', error);
      throw error;
    }
  }

  /**
   * Veritabanı sorgusu için WHERE koşullarını oluştur
   */
  private buildWhereClause(options: ExportOptions): any {
    const where: any = {};

    // Tarih filtreleri
    if (options.startDate || options.endDate) {
      where.receivedAt = {};
      
      if (options.startDate) {
        const startDateTime = this.createDateTime(options.startDate, options.startTime || '00:00');
        where.receivedAt.gte = startDateTime;
      }
      
      if (options.endDate) {
        const endDateTime = this.createDateTime(options.endDate, options.endTime || '23:59');
        where.receivedAt.lte = endDateTime;
      }
    }

    // Gönderen email filtresi
    if (options.fromEmail) {
      where.fromAddr = {
        contains: options.fromEmail,
        mode: 'insensitive'
      };
    }

    // Konu filtresi
    if (options.subjectFilter) {
      where.subject = {
        contains: options.subjectFilter,
        mode: 'insensitive'
      };
    }

    return where;
  }

  /**
   * Tarih ve saatten DateTime objesi oluştur
   */
  private createDateTime(dateStr: string, timeStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    
    return new Date(year, month - 1, day, hour, minute, 0);
  }

  /**
   * TXT içeriğini oluştur
   */
  private generateTxtContent(emails: any[], options: ExportOptions): string {
    let content = '';
    
    // Başlık
    content += '='.repeat(80) + '\n';
    content += 'MAIL EXPORT RAPORU\n';
    content += '='.repeat(80) + '\n';
    content += `Export Tarihi: ${new Date().toLocaleString('tr-TR')}\n`;
    content += `Toplam Mail Sayısı: ${emails.length}\n`;
    content += `Filtreler:\n`;
    
    if (options.startDate) content += `  - Başlangıç Tarihi: ${options.startDate}\n`;
    if (options.endDate) content += `  - Bitiş Tarihi: ${options.endDate}\n`;
    if (options.startTime) content += `  - Başlangıç Saati: ${options.startTime}\n`;
    if (options.endTime) content += `  - Bitiş Saati: ${options.endTime}\n`;
    if (options.fromEmail) content += `  - Gönderen: ${options.fromEmail}\n`;
    if (options.subjectFilter) content += `  - Konu Filtresi: ${options.subjectFilter}\n`;
    
    content += '='.repeat(80) + '\n\n';

    // Her mail için detaylı bilgi
    emails.forEach((email, index) => {
      content += `MAIL ${index + 1}\n`;
      content += '-'.repeat(40) + '\n';
      content += `ID: ${email.id}\n`;
      content += `Gönderen: ${email.fromAddr || 'Bilinmiyor'}\n`;
      content += `Konu: ${email.subject || 'Konu yok'}\n`;
      content += `Alındığı Tarih: ${email.receivedAt ? email.receivedAt.toLocaleString('tr-TR') : 'Bilinmiyor'}\n`;
      content += `Oluşturulma Tarihi: ${email.createdAt.toLocaleString('tr-TR')}\n`;
      content += `Gmail ID: ${email.gmailId || 'Yok'}\n`;
      content += `Thread ID: ${email.threadId || 'Yok'}\n`;
      content += `Durum: Ham Mail (AI işleme yok)\n`;
      
      if (email.labelIds) {
        content += `Etiketler: ${JSON.stringify(email.labelIds)}\n`;
      }

      // Raw içerik varsa göster (opsiyonel)
      if (options.includeRaw && email.raw) {
        content += `\nHam İçerik:\n`;
        content += '-'.repeat(20) + '\n';
        content += email.raw + '\n';
        content += '-'.repeat(20) + '\n';
      }

      content += '\n' + '='.repeat(80) + '\n\n';
    });

    // Özet
    content += 'ÖZET\n';
    content += '='.repeat(40) + '\n';
    content += `Toplam Mail: ${emails.length}\n`;
    content += `Durum: Tüm mailler ham olarak kaydedildi (AI işleme yok)\n`;
    
    // Tarih aralığı
    if (emails.length > 0) {
      const dates = emails
        .map(e => e.receivedAt)
        .filter(d => d)
        .sort();
      
      if (dates.length > 0) {
        content += `En Eski Mail: ${dates[0].toLocaleString('tr-TR')}\n`;
        content += `En Yeni Mail: ${dates[dates.length - 1].toLocaleString('tr-TR')}\n`;
      }
    }

    return content;
  }

  /**
   * Export edilmiş dosyanın yolunu döndür
   */
  async getExportedFilePath(fileName: string): Promise<string> {
    const filePath = path.join(this.exportDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('Export file not found');
    }
    
    return filePath;
  }

  /**
   * Export istatistiklerini getir
   */
  async getExportStats(): Promise<any> {
    try {
      const [
        totalEmails,
        recentExports
      ] = await Promise.all([
        prisma.inboundEmail.count(),
        this.getRecentExports()
      ]);

      return {
        totalEmails,
        cargoEmails: 0, // AI classification removed
        vesselEmails: 0, // AI classification removed
        unprocessedEmails: 0, // All emails are now "unprocessed" (no AI)
        recentExports,
        exportDirectory: this.exportDir
      };
    } catch (error) {
      logger.error('Error getting export stats:', error);
      throw error;
    }
  }

  /**
   * Son export dosyalarını listele
   */
  async listExportedFiles(): Promise<any[]> {
    try {
      const files = fs.readdirSync(this.exportDir)
        .filter(file => file.endsWith('.txt'))
        .map(file => {
          const filePath = path.join(this.exportDir, file);
          const stats = fs.statSync(filePath);
          
          return {
            fileName: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.created.getTime() - a.created.getTime());

      return files;
    } catch (error) {
      logger.error('Error listing exported files:', error);
      throw error;
    }
  }

  /**
   * Mailleri Word dosyası olarak export et
   */
  private async exportToWord(emails: any[], options: ExportOptions, filePath: string): Promise<void> {
    try {
      const paragraphs: Paragraph[] = [];

      // Başlık
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "📧 Mail Export Raporu",
              bold: true,
              size: 32
            })
          ],
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER
        })
      );

      // Boş satır
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

      // Özet bilgileri
      const summary = this.generateSummary(emails, options);
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "📊 Özet Bilgiler",
              bold: true,
              size: 24
            })
          ],
          heading: HeadingLevel.HEADING_1
        })
      );

      summary.split('\n').forEach((line: string) => {
        if (line.trim()) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 20
                })
              ]
            })
          );
        }
      });

      // Boş satır
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })] }));

      // Mail detayları
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "📬 Mail Detayları",
              bold: true,
              size: 24
            })
          ],
          heading: HeadingLevel.HEADING_1
        })
      );

      emails.forEach((email, index) => {
        // Mail başlığı
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Mail ${index + 1}`,
                bold: true,
                size: 20
              })
            ],
            heading: HeadingLevel.HEADING_2
          })
        );

        // Mail bilgileri
        const emailInfo = this.formatEmailInfo(email, options);
        emailInfo.split('\n').forEach(line => {
          if (line.trim()) {
            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: line,
                    size: 18
                  })
                ]
              })
            );
          }
        });

        // Boş satır
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
      });

      // Word belgesi oluştur
      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs
        }]
      });

      // Dosyayı kaydet
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);

      logger.info(`Word export completed: ${filePath}`);

    } catch (error) {
      logger.error('Error creating Word document:', error);
      throw error;
    }
  }

  /**
   * Özet bilgileri oluştur
   */
  private generateSummary(emails: any[], options: ExportOptions): string {
    let summary = '';
    
    summary += `📊 Toplam Mail Sayısı: ${emails.length}\n`;
    summary += `📅 Export Tarihi: ${new Date().toLocaleString('tr-TR')}\n`;
    summary += `📋 Format: ${options.format === 'docx' ? 'Word (DOCX)' : 'Metin (TXT)'}\n`;
    
    if (options.startDate || options.endDate) {
      summary += `📅 Tarih Aralığı: `;
      if (options.startDate) summary += `${options.startDate}`;
      if (options.startDate && options.endDate) summary += ` - `;
      if (options.endDate) summary += `${options.endDate}`;
      summary += `\n`;
    }
    
    if (options.fromEmail) {
      summary += `👤 Gönderen Filtresi: ${options.fromEmail}\n`;
    }
    
    if (options.subjectFilter) {
      summary += `🔍 Konu Filtresi: ${options.subjectFilter}\n`;
    }
    
    summary += `\n📝 Durum: Tüm mailler ham olarak kaydedildi (AI işleme yok)\n`;
    
    return summary;
  }

  /**
   * Mail bilgilerini formatla
   */
  private formatEmailInfo(email: any, options: ExportOptions): string {
    let info = '';
    
    info += `📧 Konu: ${email.subject || 'Konu yok'}\n`;
    info += `👤 Gönderen: ${email.fromAddr || 'Bilinmiyor'}\n`;
    info += `📅 Tarih: ${email.receivedAt ? new Date(email.receivedAt).toLocaleString('tr-TR') : 'Bilinmiyor'}\n`;
    info += `🆔 ID: ${email.id}\n`;
    
    if (options.includeRaw && email.raw) {
      info += `\n📄 İçerik:\n`;
      info += `${email.raw.substring(0, 1000)}${email.raw.length > 1000 ? '...' : ''}\n`;
    }
    
    return info;
  }

  /**
   * Son export dosyalarını getir
   */
  private async getRecentExports(): Promise<any[]> {
    try {
      const files = await this.listExportedFiles();
      return files.slice(0, 10); // Son 10 dosya
    } catch (error) {
      logger.error('Error getting recent exports:', error);
      return [];
    }
  }
}
