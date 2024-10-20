import { Request, Response } from 'express';
import { Product, Order } from '../../imports.js';

const updateProductStock = async (items: any[]) => {
	for (const item of items) {
		const product = await Product.findById(item._id);
		if (product) {
			product.stock += item.qty;
			await product.save();
		}
	}
};

const resetOrderItems = (items: any[]) => {
	return items.map((item: any) => ({
		...item,
		returnQty: item.qty,
		totalPrice: 0,
		totalVat: 0,
	}));
};

const cancelOrder = async (req: Request, res: Response): Promise<Response> => {
	const { id } = req.params;
	try {
		const myOrder = (await Order.findById(id)) as any;
		if (!myOrder) return res.status(404).json({ message: 'Order not found' });

		if (myOrder.isCancelled) return res.status(400).json({ message: 'Order already cancelled' });
		if (myOrder.isDelivered) return res.status(400).json({ message: 'Order already delivered' });

		myOrder.status = 'cancelled';
		myOrder.isCancelled = true;

		await updateProductStock(myOrder.items);

		myOrder.items = resetOrderItems(myOrder.items);

		myOrder.profit = 0;
		myOrder.subTotal = 0;
		myOrder.total = 0;
		myOrder.vat = 0;
		myOrder.dueAmount = myOrder.paidAmount * -1;

		const savedOrder = await myOrder.save();

		return res.status(200).json({ doc: savedOrder });
	} catch (error: any) {
		console.error(error.message);
		return res.status(500).json({ message: error.message });
	}
};

export default cancelOrder;
