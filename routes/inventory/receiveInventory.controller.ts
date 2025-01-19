import { Product, Transfer } from '../../models/index.js';
import { Response } from 'express';

const receiveInventoryController = async (req: any, res: Response) => {
	try {
		const { id } = req.params;
		const getTransfer = await Transfer.findById(id);

		if (!getTransfer) return res.status(404).json({ message: 'Transfer not found' });
		if (getTransfer.status === 'completed')
			return res.status(400).json({ message: 'Transfer already received' });

		getTransfer?.products?.map(async (item: any) => {
			const { product: _id, toReceive: qty } = item;
			const product = await Product.findById(_id);

			if (!product.inventory) product.inventory = [];

			// Find or create destination location inventory
			let destinationInventory = product.inventory.find(
				(inv: any) => inv.location.toString() === getTransfer.destination.toString()
			);

			if (destinationInventory) {
				// Update existing location inventory
				destinationInventory.stock += Number(qty);
				destinationInventory.incomingStock -= Number(qty);
			}
			// if (status == 'completed') destinationInventory.stock += Number(qty);
			// else destinationInventory.incomingStock += Number(qty);

			await product.save();
		});

		getTransfer.products = getTransfer?.products?.map((item: any) => ({
			product: item.product,
			quantity: item.quantity,
			status: 'completed',
			damagedQty: 0,
			receivedQty: item.quantity,
			toReceive: 0,
		}));

		getTransfer.status = 'completed';

		const saved = await getTransfer?.save();

		if (saved) {
			if (!res.headersSent) return res.status(200).json({ message: 'Transfer successful', saved });
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

export default receiveInventoryController;
