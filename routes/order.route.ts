// Import necessary modules from their respective files
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import express from 'express';
import constructConfig from '../lib/configurator/constructConfig.js';

import {
	protect,
	sort,
	query,
	validate,
	hasPermission,
} from '../middleware/index.js';
import {
	deleteDocument,
	getFilters,
	updateDocument,
	getAllDocuments,
	getDocumentById,
	getDocumentToEditById,
	duplicateDocument,
	updateManyDocuments,
	exportDocument,
	getCount,
} from '../controllers/common/index.js';

import Order, { settings } from '../models/order/order.model.js';
import getOrderTotal from '../controllers/order/getOrderTotal.js';
import addOrder from '../controllers/order/addOrder.controller.js';
import getSum from '../controllers/common/getSum.controller.js';
import cancelOrder from '../controllers/order/cancelOrder.controller.js';

// Initialize a new router
const router = express.Router();

const config = constructConfig({
	model: Order,
	config: settings,
});

// Define common middleware
const commonMiddleware = [
	protect,
	sort,
	query(config.FILTER_OPTIONS),
	hasPermission(['view_order']),
];
const postMiddleware = [
	protect,
	validate(config.VALIDATORS.POST),
	hasPermission(['add_order']),
];
const updateMiddleware = [
	protect,
	validate(config.VALIDATORS.UPDATE),
	hasPermission(['edit_order']),
];

const countMiddleware = [protect, query(config.FILTER_OPTIONS)];

// Define the routes for the product store
router
	.route('/')
	.get(...commonMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...postMiddleware, addOrder);

router.get(
	'/:id',
	protect,
	hasPermission(['view_order']),
	getDocumentById(config.QUERY_OPTIONS)
);

router.get(
	'/edit/:id',
	protect,
	hasPermission(['view_order']),
	getDocumentToEditById(config.MODEL)
);

router.get('/get/filters', protect, getFilters(config.FILTER_LIST));
router.put('/:id', ...updateMiddleware, updateDocument(config.EDITS));
router.delete('/:id', protect, cancelOrder);
router.get('/get/count', ...countMiddleware, getCount(config.MODEL));

router.get('/get/sum/:field', ...countMiddleware, getSum(config.MODEL));

router.post('/export/csv', protect, exportDocument(config.QUERY_OPTIONS));

router.put(
	'/update/many',
	protect,
	hasPermission(['edit_order']),
	updateManyDocuments(config.EDITS)
);
router.put('/copy/:id', protect, duplicateDocument(config.DUPLICATE_OPTIONS));

router.post('/cart-total', protect, getOrderTotal);

router.get(
	'/invoice/:id',
	protect,
	hasPermission(['view_order']),
	async (req, res) => {
		try {
			const { id } = req.params;
			const order = await Order.findById(id).populate('customer');

			if (!order) {
				return res.status(404).json({ error: 'Order not found' });
			}

			// Create a new PDF document
			const doc = new PDFDocument();

			// Pipe the PDF to a buffer
			const chunks: any = [];
			doc.on('data', chunk => chunks.push(chunk));
			doc.on('end', () => {
				const result = Buffer.concat(chunks);
				res.setHeader('Content-Type', 'application/pdf');
				res.setHeader(
					'Content-Disposition',
					`attachment; filename=invoice-${id}.pdf`
				);
				res.send(result);
			});

			// Add content to the PDF
			doc.fontSize(20).text(`Invoice: #${order.invoice}`, { align: 'center' });
			doc.moveDown();
			// doc.fontSize(14).text(`Customer: ${order.customer?.name || 'Walk-in Customer'}`);
			doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
			doc.text(`Total: $${order.total}`);

			// Add a table for product details
			doc.moveDown();
			doc.text('Products:', { underline: true });
			// order.products.forEach((product) => {
			// 	doc.text(`${product.name} - $${product.price} x ${product.quantity}`);
			// });

			// Finalize the PDF
			doc.end();
		} catch (error) {
			console.error('Error generating invoice:', error);
			res.status(500).json({ error: 'Failed to generate invoice' });
		}
	}
);

// Export the router
export default router;
