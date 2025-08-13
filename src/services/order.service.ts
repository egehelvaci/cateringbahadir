import { PrismaClient, OrderStatus } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class OrderService {
  async createOrder(data: {
    orderNumber: string;
    customerName: string;
    customerPhone?: string;
    totalAmount?: number;
    notes?: string;
    items: {
      qrCode: string;
      productName: string;
      quantity: number;
      price?: number;
    }[];
  }) {
    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: data.orderNumber,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          totalAmount: data.totalAmount,
          notes: data.notes,
          status: OrderStatus.PENDING,
          items: {
            create: data.items
          }
        },
        include: {
          items: true
        }
      });
      return order;
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  async confirmOrder(orderId: number) {
    try {
      const order = await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
        include: { items: true }
      });
      return order;
    } catch (error) {
      logger.error('Error confirming order:', error);
      throw error;
    }
  }

  async scanQRCode(data: {
    qrCode: string;
    employeeId?: number;
    scannedBy?: string;
  }) {
    try {
      // QR koduna ait OrderItem'ı bul
      const orderItem = await prisma.orderItem.findUnique({
        where: { qrCode: data.qrCode },
        include: { 
          order: {
            include: { items: true }
          }
        }
      });

      if (!orderItem) {
        throw new Error('QR kod bulunamadı');
      }

      // Sipariş onaylanmış mı kontrol et
      if (orderItem.order.status === OrderStatus.PENDING) {
        throw new Error('Sipariş henüz onaylanmamış');
      }

      // İptal edilmiş sipariş kontrolü
      if (orderItem.order.status === OrderStatus.CANCELLED) {
        throw new Error('Sipariş iptal edilmiş');
      }

      // Teslim edilmiş sipariş kontrolü
      if (orderItem.order.status === OrderStatus.DELIVERED) {
        return {
          success: false,
          message: 'Sipariş zaten teslim edilmiş',
          order: orderItem.order
        };
      }

      // Hangi okutma olduğunu belirle
      let scanType: number;
      let updateData: any = {};
      
      if (!orderItem.firstScanAt) {
        // İlk okutma (hazırlama)
        scanType = 1;
        updateData.firstScanAt = new Date();
      } else if (!orderItem.secondScanAt) {
        // İkinci okutma (teslimat)
        scanType = 2;
        updateData.secondScanAt = new Date();
      } else {
        // Zaten iki kez okutulmuş
        return {
          success: false,
          message: 'Bu QR kod zaten iki kez okutulmuş',
          order: orderItem.order
        };
      }

      // QR scan kaydı oluştur
      await prisma.qRScan.create({
        data: {
          orderId: orderItem.orderId,
          orderItemId: orderItem.id,
          qrCode: data.qrCode,
          scanType: scanType,
          employeeId: data.employeeId,
          scannedBy: data.scannedBy
        }
      });

      // OrderItem'ı güncelle
      await prisma.orderItem.update({
        where: { id: orderItem.id },
        data: updateData
      });

      // Tüm item'lar okutuldu mu kontrol et
      const updatedOrder = await prisma.order.findUnique({
        where: { id: orderItem.orderId },
        include: { items: true }
      });

      if (!updatedOrder) {
        throw new Error('Sipariş bulunamadı');
      }

      // Tüm item'ların durumunu kontrol et
      const allItemsFirstScanned = updatedOrder.items.every(item => item.firstScanAt !== null);
      const allItemsSecondScanned = updatedOrder.items.every(item => item.secondScanAt !== null);

      let orderStatusUpdate: OrderStatus | null = null;
      let statusMessage = '';

      if (allItemsSecondScanned) {
        // Tüm QR'lar ikinci kez okutuldu - Teslim edildi
        orderStatusUpdate = OrderStatus.DELIVERED;
        statusMessage = 'Tüm ürünler teslim edildi. Sipariş tamamlandı!';
      } else if (allItemsFirstScanned && scanType === 1) {
        // Tüm QR'lar ilk kez okutuldu - Hazır
        orderStatusUpdate = OrderStatus.READY;
        statusMessage = 'Tüm ürünler hazırlandı. Sipariş teslimata hazır!';
      }

      // Sipariş durumunu güncelle
      if (orderStatusUpdate) {
        await prisma.order.update({
          where: { id: orderItem.orderId },
          data: { status: orderStatusUpdate }
        });
      }

      // Güncel siparişi al
      const finalOrder = await prisma.order.findUnique({
        where: { id: orderItem.orderId },
        include: { items: true }
      });

      return {
        success: true,
        message: statusMessage || `QR kod başarıyla okutuldu (${scanType === 1 ? 'Hazırlama' : 'Teslimat'})`,
        scanType: scanType,
        order: finalOrder,
        scannedItem: orderItem,
        progress: {
          totalItems: updatedOrder.items.length,
          firstScanned: updatedOrder.items.filter(item => item.firstScanAt !== null).length,
          secondScanned: updatedOrder.items.filter(item => item.secondScanAt !== null).length
        }
      };
    } catch (error) {
      logger.error('Error scanning QR code:', error);
      throw error;
    }
  }

  async getOrder(orderId: number) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          qrScans: {
            include: {
              employee: true
            },
            orderBy: { scannedAt: 'desc' }
          }
        }
      });
      return order;
    } catch (error) {
      logger.error('Error getting order:', error);
      throw error;
    }
  }

  async getOrderByNumber(orderNumber: string) {
    try {
      const order = await prisma.order.findUnique({
        where: { orderNumber },
        include: {
          items: true,
          qrScans: {
            include: {
              employee: true
            },
            orderBy: { scannedAt: 'desc' }
          }
        }
      });
      return order;
    } catch (error) {
      logger.error('Error getting order by number:', error);
      throw error;
    }
  }

  async getAllOrders(status?: OrderStatus) {
    try {
      const where = status ? { status } : {};
      const orders = await prisma.order.findMany({
        where,
        include: {
          items: true
        },
        orderBy: { createdAt: 'desc' }
      });
      return orders;
    } catch (error) {
      logger.error('Error getting orders:', error);
      throw error;
    }
  }

  async getEmployeeStats(employeeId?: number, startDate?: Date, endDate?: Date) {
    try {
      const where: any = {};
      
      if (employeeId) {
        where.employeeId = employeeId;
      }
      
      if (startDate || endDate) {
        where.scannedAt = {};
        if (startDate) where.scannedAt.gte = startDate;
        if (endDate) where.scannedAt.lte = endDate;
      }

      // Çalışan bazlı istatistikler
      const stats = await prisma.qRScan.groupBy({
        by: ['employeeId', 'scanType'],
        where,
        _count: {
          id: true
        }
      });

      // Çalışan bilgilerini al
      const employeeIds = [...new Set(stats.map(s => s.employeeId).filter(id => id !== null))];
      const employees = await prisma.employee.findMany({
        where: { id: { in: employeeIds as number[] } }
      });

      const employeeMap = new Map(employees.map(e => [e.id, e]));

      // İstatistikleri formatla
      const formattedStats = stats.reduce((acc: any[], stat) => {
        if (!stat.employeeId) return acc;
        
        const employee = employeeMap.get(stat.employeeId);
        if (!employee) return acc;

        let existing = acc.find(e => e.employeeId === stat.employeeId);
        if (!existing) {
          existing = {
            employeeId: stat.employeeId,
            employeeName: employee.name,
            department: employee.department,
            preparationCount: 0,
            deliveryCount: 0,
            totalCount: 0
          };
          acc.push(existing);
        }

        if (stat.scanType === 1) {
          existing.preparationCount = stat._count.id;
        } else if (stat.scanType === 2) {
          existing.deliveryCount = stat._count.id;
        }
        existing.totalCount += stat._count.id;

        return acc;
      }, []);

      return formattedStats.sort((a, b) => b.totalCount - a.totalCount);
    } catch (error) {
      logger.error('Error getting employee stats:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: number) {
    try {
      const order = await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
        include: { items: true }
      });
      return order;
    } catch (error) {
      logger.error('Error cancelling order:', error);
      throw error;
    }
  }

  async getOrderStatistics(startDate?: Date, endDate?: Date) {
    try {
      const where: any = {};
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      // Duruma göre sipariş sayıları
      const statusCounts = await prisma.order.groupBy({
        by: ['status'],
        where,
        _count: {
          id: true
        }
      });

      // Toplam sipariş sayısı ve tutar
      const totals = await prisma.order.aggregate({
        where,
        _count: {
          id: true
        },
        _sum: {
          totalAmount: true
        }
      });

      // Günlük sipariş sayıları (son 30 gün)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const dailyOrders = await prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count,
          SUM(total_amount) as total
        FROM "Order"
        WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `;

      // Formatla
      const statusMap = {
        PENDING: 0,
        CONFIRMED: 0,
        READY: 0,
        DELIVERED: 0,
        CANCELLED: 0
      };

      statusCounts.forEach(sc => {
        statusMap[sc.status] = sc._count.id;
      });

      return {
        summary: {
          total: totals._count.id,
          totalAmount: totals._sum.totalAmount || 0,
          byStatus: statusMap,
          statusBreakdown: [
            { status: 'PENDING', label: 'Beklemede', count: statusMap.PENDING },
            { status: 'CONFIRMED', label: 'Onaylandı', count: statusMap.CONFIRMED },
            { status: 'READY', label: 'Hazır', count: statusMap.READY },
            { status: 'DELIVERED', label: 'Teslim Edildi', count: statusMap.DELIVERED },
            { status: 'CANCELLED', label: 'İptal Edildi', count: statusMap.CANCELLED }
          ]
        },
        dailyOrders
      };
    } catch (error) {
      logger.error('Error getting order statistics:', error);
      throw error;
    }
  }
}