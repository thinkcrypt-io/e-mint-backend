import Return from '../../models/return/saleReturn.model.js';
import { Order, Product, ProductType } from '../../imports.js';

const adjustReturn = async (req: any, res: any, next: any) => {
	try {
		const { items, amount, reason, otherReason, reference, order, date, note } = req.body;

		const findOrder = await Order.findById(order);

		console.log(findOrder);
		if (!findOrder) {
			return res.status(400).json({ message: 'Order not found' });
		}

		findOrder.items = findOrder.items.map((item: any) => {
			const returnItem = items.find((i: any) => i._id == item._id);
			if (returnItem) {
				item.returnQty = item.returnQty + Number(returnItem.returnQty);
			}
			return item;
		}, []);

		findOrder.returnAmount = Number(amount);
		findOrder.total = findOrder.total - Number(amount);
		findOrder.dueAmount = (findOrder.dueAmount || 0) - Number(amount);

		if (findOrder.dueAmount <= 0) {
			findOrder.isPaid = true;
		}

		await findOrder.save();

		for (const item of items) {
			const { _id, qty, returnQty, returnAmount } = item;
			const data = await Product.findById(_id);
			if (data) {
				data.stock += returnQty;
				data.save();
			}
		}

		const newReturn = new Return({
			invoice: findOrder?.invoice,
			customer: findOrder?.customer,
			items,
			amount: Number(amount),
			reason,
			otherReason,
			reference,
			order,
			date,
			note,
		});

		const saved = await newReturn.save();

		return res.status(200).json({ newReturn: saved });
	} catch (e: any) {
		return res.status(500).json({ message: e.message });
	}
};

export default adjustReturn;
