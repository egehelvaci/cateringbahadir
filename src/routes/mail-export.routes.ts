import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { MailExportService } from '../services/mail-export.service';
import { logger } from '../utils/logger';

const router = Router();
const mailExportService = new MailExportService();

// Export emails to TXT format with date/time filters
router.post('/export-txt',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        startDate,
        endDate,
        startTime,
        endTime,
        fromEmail,
        subjectFilter,
        includeRaw = false,
        format = 'txt'
      } = req.body;

      logger.info('Mail export request received', {
        startDate,
        endDate,
        startTime,
        endTime,
        fromEmail,
        subjectFilter,
        includeRaw,
        format
      });

      const result = await mailExportService.exportEmailsToTxt({
        startDate,
        endDate,
        startTime,
        endTime,
        fromEmail,
        subjectFilter,
        includeRaw,
        format
      });

      res.json({
        success: true,
        message: 'Mail export completed successfully',
        data: {
          fileName: result.fileName,
          totalEmails: result.totalEmails,
          fileSize: result.fileSize,
          downloadUrl: `/api/mail-export/download/${result.fileName}`
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /mail-export/export-word - Mailleri Word formatında export et
router.post('/export-word',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        startDate,
        endDate,
        startTime,
        endTime,
        fromEmail,
        subjectFilter,
        includeRaw = false
      } = req.body;

      logger.info('Word export request received', {
        startDate,
        endDate,
        startTime,
        endTime,
        fromEmail,
        subjectFilter,
        includeRaw
      });

      const result = await mailExportService.exportEmailsToTxt({
        startDate,
        endDate,
        startTime,
        endTime,
        fromEmail,
        subjectFilter,
        includeRaw,
        format: 'docx'
      });

      res.json({
        success: true,
        message: 'Word export completed successfully',
        data: {
          fileName: result.fileName,
          totalEmails: result.totalEmails,
          fileSize: result.fileSize,
          downloadUrl: result.downloadUrl
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// Download exported file
router.get('/download/:fileName',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fileName } = req.params;
      
      const filePath = await mailExportService.getExportedFilePath(fileName);
      
      // Dosya uzantısına göre content-type belirle
      const extension = fileName.split('.').pop()?.toLowerCase();
      let contentType = 'text/plain';
      
      if (extension === 'docx') {
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      
      res.setHeader('Content-Type', contentType);
      res.download(filePath, fileName, (err) => {
        if (err) {
          logger.error('Error downloading file:', err);
          res.status(404).json({
            success: false,
            message: 'File not found'
          });
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get export statistics
router.get('/stats',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await mailExportService.getExportStats();
      
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// List available export files
router.get('/files',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const files = await mailExportService.listExportedFiles();
      
      res.json({
        success: true,
        data: files,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
