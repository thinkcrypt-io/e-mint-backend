import Joi from 'joi';
import { Product, Transfer } from '../../models/index.js';

const transferStockController = async (req: any, res: any) => {
	const { error } = validate(req.body);
	if (error) return res.status(400).send({ message: error.details[0].message });
	try {
		const { id } = req.params;
		const { location, quantity, source, reason } = req.body;

		if (!quantity || quantity <= 0) return res.status(400).json({ message: 'Invalid quantity' });

		const product = await Product.findById(id);

		if (!product) return res.status(400).json({ error: 'Product Not Found' });
		if (product.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

		// Initialize inventory array if it doesn't exist
		if (!product.inventory) {
			product.inventory = [];
		}

		let type;

		if (source) {
			// Handle transfer between locations
			type = 'ltl';

			const sourceInventory = product.inventory.find(
				(inv: any) => inv.location.toString() === source
			);

			if (!sourceInventory)
				return res.status(400).json({ message: 'Source location inventory not found' });

			if (sourceInventory.stock < quantity)
				return res.status(400).json({ message: 'Insufficient stock in source location' });

			// Deduct from source location
			sourceInventory.stock -= quantity;
		} else {
			type = 'mtl';
			// If no source location, deduct from main product stock
			if (product.stock < quantity) return res.status(400).json({ error: 'Insufficient stock' });

			product.stock -= quantity;
		}

		// Find or create destination location inventory
		let destinationInventory = product.inventory.find(
			(inv: any) => inv.location.toString() === location
		);

		if (destinationInventory) {
			// Update existing location inventory
			destinationInventory.stock += quantity;
		} else {
			// Create new location inventory
			product.inventory.push({
				location,
				stock: quantity,
				damage: 0,
				reservedStock: 0,
				incomingStock: 0,
			});
		}

		// Save the updated product
		const updatedProduct = await product.save();

		const transfer = new Transfer({
			product: id,
			destination: location,
			source,
			type,
			quantity,
			shop: req.shop._id,
			reason,
		});

		return res.json({
			product: updatedProduct,
			message: 'Product transferred successfully',
		});
	} catch (error: any) {
		return res.status(500).json({
			message: error.message,
		});
	}
};

const validate = (data: any): Joi.ValidationResult => {
	const schema = Joi.object({
		location: Joi.string().required().messages({
			'any.required': `Location is a required field`,
		}),
		quantity: Joi.number().required().min(1).messages({
			'any.required': `Quantity is a required field`,
			'number.base': `Quantity must be a number`,
			'number.min': `Quantity must be greater than 0`,
		}),
		source: Joi.string(),
		reason: Joi.string().valid('restock', 'return', 'relocation', 'damage', 'other'),
	});
	return schema.validate(data);
};

export default transferStockController;
