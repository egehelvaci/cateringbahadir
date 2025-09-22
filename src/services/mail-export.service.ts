import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface ExportOptions {
  startDate?: string; // YYYY-MM-DD format
  endDate?: string;   // YYYY-MM-DD format
  startTime?: string; // HH:MM format
  endTime?: string;   // HH:MM format
  fromEmail?: string;
  subjectFilter?: string;
  includeRaw?: boolean;
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
   * Mailleri TXT formatında export et
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
      const fileName = `mail-export-${timestamp}.txt`;
      const filePath = path.join(this.exportDir, fileName);

      // TXT içeriğini oluştur
      const txtContent = this.generateTxtContent(emails, options);

      // Dosyayı yaz
      fs.writeFileSync(filePath, txtContent, 'utf8');

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
      content += `İşlenmiş Tip: ${email.parsedType || 'İşlenmemiş'}\n`;
      
      if (email.labelIds) {
        content += `Etiketler: ${JSON.stringify(email.labelIds)}\n`;
      }

      // İşlenmiş JSON verisi varsa göster
      if (email.parsedJson) {
        content += `\nİşlenmiş Veri:\n`;
        content += JSON.stringify(email.parsedJson, null, 2) + '\n';
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
    
    const cargoCount = emails.filter(e => e.parsedType === 'CARGO').length;
    const vesselCount = emails.filter(e => e.parsedType === 'VESSEL').length;
    const unprocessedCount = emails.filter(e => !e.parsedType).length;
    
    content += `Kargo Mailleri: ${cargoCount}\n`;
    content += `Gemi Mailleri: ${vesselCount}\n`;
    content += `İşlenmemiş Mailler: ${unprocessedCount}\n`;
    
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
        cargoEmails,
        vesselEmails,
        unprocessedEmails,
        recentExports
      ] = await Promise.all([
        prisma.inboundEmail.count(),
        prisma.inboundEmail.count({ where: { parsedType: 'CARGO' } }),
        prisma.inboundEmail.count({ where: { parsedType: 'VESSEL' } }),
        prisma.inboundEmail.count({ where: { parsedType: null } }),
        this.getRecentExports()
      ]);

      return {
        totalEmails,
        cargoEmails,
        vesselEmails,
        unprocessedEmails,
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
