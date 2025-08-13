import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';

const router = Router();
const orderController = new OrderController();

// Sipariş CRUD
router.post('/orders', orderController.createOrder);
router.get('/orders', orderController.getAllOrders);
router.get('/orders/statistics', orderController.getOrderStatistics);
router.get('/orders/:id', orderController.getOrder);
router.get('/orders/number/:orderNumber', orderController.getOrderByNumber);
router.put('/orders/:id/confirm', orderController.confirmOrder);
router.put('/orders/:id/cancel', orderController.cancelOrder);

// QR Kod İşlemleri
router.post('/orders/scan-qr', orderController.scanQRCode);

// Çalışan İstatistikleri
router.get('/orders/employee/stats', orderController.getEmployeeStats);

export default router;