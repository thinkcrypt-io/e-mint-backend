import Joi from 'joi';
import { Product, Transfer } from '../../models/index.js';
import { Response } from 'express';
import addProductList from '@/controllers/content/addProductList.controller.js';

const transferBulkInventoryController = async (req: any, res: Response) => {
	const { error } = validate(req.body);
	if (error) return res.status(400).send({ message: error.details[0].message });
	try {
		const { location, source, reason, items, status, date, ref } = req.body;

		const productUpdates = items?.map(async (item: any) => {
			const { _id, qty } = item;
			const product = await Product.findById(_id);

			if (!product.inventory) product.inventory = [];

			let type;

			if (source && source != '') {
				// Handle transfer between locations
				type = 'ltl';

				const sourceInventory = product.inventory.find(
					(inv: any) => inv.location.toString() === source
				);

				if (sourceInventory.stock < qty)
					return res.status(400).json({ message: 'Insufficient stock in source location' });

				// Deduct from source location
				sourceInventory.stock -= Number(qty);
			} else {
				type = 'mtl';
				// If no source location, deduct from main product stock
				if (product.stock < qty)
					return res
						.status(400)
						.json({ message: `Insufficient stock for product ${product?.name}` });

				product.stock -= Number(qty);
			}

			// Find or create destination location inventory
			let destinationInventory = product.inventory.find(
				(inv: any) => inv.location.toString() === location
			);

			if (destinationInventory) {
				// Update existing location inventory
				if (status == 'completed') destinationInventory.stock += Number(qty);
				else destinationInventory.incomingStock += Number(qty);
			} else {
				// Create new location inventory
				product.inventory.push({
					location,
					stock: status != 'completed' ? 0 : Number(qty),
					damage: 0,
					reservedStock: 0,
					incomingStock: status != 'completed' ? Number(qty) : 0,
				});
			}
			await product.save();
		});

		await Promise.all(productUpdates);

		const createTransfer = new Transfer({
			destination: location,
			source: source && source != '' ? source : null,
			reason,
			products: items.map((item: any) => ({
				product: item._id,
				quantity: item.qty,
				status: status,
				damagedQty: 0,
				receivedQty: status == 'completed' ? item.qty : 0,
				toReceive: status == 'completed' ? 0 : item.qty,
			})),
			status,
			ref,
			date,
			shop: req.shop,
		});

		const saved = await createTransfer.save();

		if (saved) {
			if (!res.headersSent) return res.status(200).json({ message: 'Transfer successful' });
		}

		// Initialize inventory array if it doesn't exist
	} catch (error: any) {
		if (!res.headersSent) {
			return res.status(500).json({
				message: error.message,
			});
		}
	}
};

const validate = (data: any): Joi.ValidationResult => {
	const schema = Joi.object({
		location: Joi.string().required().messages({
			'any.required': `Location is a required field`,
		}),
		items: Joi.array().required().messages({
			'any.required': `Items is a required`,
		}),

		ref: Joi.string().allow(null, ''),

		source: Joi.string().allow(null, ''),
		date: Joi.date().required().messages({
			'any.required': `Date is a required field`,
		}),
		status: Joi.string()
			.required()
			.valid(
				'initiated',
				'completed',
				'cancelled',
				'pending',
				'approved',
				'failed',
				'rejected',
				'transit',
				'delivered',
				'received',
				'dispatched',
				'returned'
			)
			.messages({
				'any.required': `Status is a required field`,
				'any.only': `Invalid status`,
				'string.empty': `Status cannot be an empty field`,
			}),
		reason: Joi.string().valid('restock', 'return', 'relocation', 'damage', 'other'),
	});
	return schema.validate(data);
};

export default transferBulkInventoryController;
