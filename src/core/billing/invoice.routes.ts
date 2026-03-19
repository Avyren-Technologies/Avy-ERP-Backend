import { Router } from 'express';
import { invoiceController } from './invoice.controller';

const router = Router();

router.get('/', invoiceController.listInvoices);
router.get('/:id', invoiceController.getInvoiceById);
router.post('/generate', invoiceController.generateInvoice);
router.patch('/:id/mark-paid', invoiceController.markAsPaid);
router.patch('/:id/void', invoiceController.voidInvoice);
router.post('/:id/send-email', invoiceController.sendEmail);
router.get('/:id/pdf', invoiceController.downloadPdf);

export { router as invoiceRoutes };
