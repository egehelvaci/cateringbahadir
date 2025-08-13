import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class EmployeeController {
  async createEmployee(req: Request, res: Response) {
    try {
      const employee = await prisma.employee.create({
        data: req.body
      });
      res.status(201).json({
        success: true,
        data: employee
      });
    } catch (error: any) {
      logger.error('Error in createEmployee:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Çalışan oluşturulamadı'
      });
    }
  }

  async updateEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const employee = await prisma.employee.update({
        where: { id: parseInt(id) },
        data: req.body
      });
      return res.json({
        success: true,
        data: employee
      });
    } catch (error: any) {
      logger.error('Error in updateEmployee:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Çalışan güncellenemedi'
      });
    }
  }

  async getEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const employee = await prisma.employee.findUnique({
        where: { id: parseInt(id) },
        include: {
          _count: {
            select: { qrScans: true }
          }
        }
      });
      
      if (!employee) {
        return res.status(404).json({
          success: false,
          error: 'Çalışan bulunamadı'
        });
      }

      return res.json({
        success: true,
        data: employee
      });
    } catch (error: any) {
      logger.error('Error in getEmployee:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Çalışan getirilemedi'
      });
    }
  }

  async getAllEmployees(req: Request, res: Response) {
    try {
      const { department, isActive } = req.query;
      
      const where: any = {};
      if (department) where.department = department;
      if (isActive !== undefined) where.isActive = isActive === 'true';
      
      const employees = await prisma.employee.findMany({
        where,
        include: {
          _count: {
            select: { qrScans: true }
          }
        },
        orderBy: { name: 'asc' }
      });
      
      return res.json({
        success: true,
        data: employees,
        count: employees.length
      });
    } catch (error: any) {
      logger.error('Error in getAllEmployees:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Çalışanlar getirilemedi'
      });
    }
  }

  async getEmployeePerformance(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;
      
      const where: any = { employeeId: parseInt(id) };
      
      if (startDate || endDate) {
        where.scannedAt = {};
        if (startDate) where.scannedAt.gte = new Date(startDate as string);
        if (endDate) where.scannedAt.lte = new Date(endDate as string);
      }

      // Çalışan bilgilerini al
      const employee = await prisma.employee.findUnique({
        where: { id: parseInt(id) }
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          error: 'Çalışan bulunamadı'
        });
      }

      // QR scan istatistikleri
      const scans = await prisma.qRScan.groupBy({
        by: ['scanType'],
        where,
        _count: {
          id: true
        }
      });

      // Son 7 günlük performans
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const dailyPerformance = await prisma.$queryRaw`
        SELECT 
          DATE(scanned_at) as date,
          scan_type,
          COUNT(*) as count
        FROM "QRScan"
        WHERE employee_id = ${parseInt(id)}
          AND scanned_at >= ${sevenDaysAgo}
        GROUP BY DATE(scanned_at), scan_type
        ORDER BY date DESC
      `;

      // Son işlemler
      const recentScans = await prisma.qRScan.findMany({
        where: { employeeId: parseInt(id) },
        include: {
          order: {
            select: {
              orderNumber: true,
              customerName: true
            }
          },
          orderItem: {
            select: {
              productName: true,
              qrCode: true
            }
          }
        },
        orderBy: { scannedAt: 'desc' },
        take: 10
      });

      // Formatla
      const stats = {
        preparationCount: 0,
        deliveryCount: 0,
        totalCount: 0
      };

      scans.forEach(scan => {
        if (scan.scanType === 1) {
          stats.preparationCount = scan._count.id;
        } else if (scan.scanType === 2) {
          stats.deliveryCount = scan._count.id;
        }
        stats.totalCount += scan._count.id;
      });

      return res.json({
        success: true,
        data: {
          employee,
          stats,
          dailyPerformance,
          recentScans
        }
      });
    } catch (error: any) {
      logger.error('Error in getEmployeePerformance:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Çalışan performansı getirilemedi'
      });
    }
  }

  async deleteEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Soft delete - sadece isActive'i false yap
      const employee = await prisma.employee.update({
        where: { id: parseInt(id) },
        data: { isActive: false }
      });
      
      res.json({
        success: true,
        data: employee,
        message: 'Çalışan pasif duruma getirildi'
      });
    } catch (error: any) {
      logger.error('Error in deleteEmployee:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Çalışan silinemedi'
      });
    }
  }
}