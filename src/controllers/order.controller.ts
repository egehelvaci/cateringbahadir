import { Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { OrderStatus } from '@prisma/client';
import { logger } from '../utils/logger';

const orderService = new OrderService();

export class OrderController {
  async createOrder(req: Request, res: Response) {
    try {
      const order = await orderService.createOrder(req.body);
      res.status(201).json({
        success: true,
        data: order
      });
    } catch (error: any) {
      logger.error('Error in createOrder:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Sipariş oluşturulamadı'
      });
    }
  }

  async confirmOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const order = await orderService.confirmOrder(parseInt(id));
      return res.json({
        success: true,
        data: order
      });
    } catch (error: any) {
      logger.error('Error in confirmOrder:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Sipariş onaylanamadı'
      });
    }
  }

  async scanQRCode(req: Request, res: Response) {
    try {
      const result = await orderService.scanQRCode(req.body);
      return res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error in scanQRCode:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'QR kod okutulamadı'
      });
    }
  }

  async getOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const order = await orderService.getOrder(parseInt(id));
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Sipariş bulunamadı'
        });
      }

      return res.json({
        success: true,
        data: order
      });
    } catch (error: any) {
      logger.error('Error in getOrder:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Sipariş getirilemedi'
      });
    }
  }

  async getOrderByNumber(req: Request, res: Response) {
    try {
      const { orderNumber } = req.params;
      const order = await orderService.getOrderByNumber(orderNumber);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Sipariş bulunamadı'
        });
      }

      return res.json({
        success: true,
        data: order
      });
    } catch (error: any) {
      logger.error('Error in getOrderByNumber:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Sipariş getirilemedi'
      });
    }
  }

  async getAllOrders(req: Request, res: Response) {
    try {
      const { status } = req.query;
      const orders = await orderService.getAllOrders(status as OrderStatus);
      return res.json({
        success: true,
        data: orders,
        count: orders.length
      });
    } catch (error: any) {
      logger.error('Error in getAllOrders:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Siparişler getirilemedi'
      });
    }
  }

  async getOrderStatistics(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const stats = await orderService.getOrderStatistics(start, end);
      return res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Error in getOrderStatistics:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'İstatistikler getirilemedi'
      });
    }
  }

  async cancelOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const order = await orderService.cancelOrder(parseInt(id));
      return res.json({
        success: true,
        data: order
      });
    } catch (error: any) {
      logger.error('Error in cancelOrder:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Sipariş iptal edilemedi'
      });
    }
  }

  async getEmployeeStats(req: Request, res: Response) {
    try {
      const { employeeId, startDate, endDate } = req.query;
      
      const empId = employeeId ? parseInt(employeeId as string) : undefined;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const stats = await orderService.getEmployeeStats(empId, start, end);
      res.json({
        success: true,
        data: stats,
        count: stats.length
      });
    } catch (error: any) {
      logger.error('Error in getEmployeeStats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Çalışan istatistikleri getirilemedi'
      });
    }
  }
}