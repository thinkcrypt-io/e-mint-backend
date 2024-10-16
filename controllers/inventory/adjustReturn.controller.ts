import Return from '../../models/return/saleReturn.model.js';
import { getErrorMessage, Order, Product, ProductType } from '../../imports.js';

const adjustReturn = async (req: any, res: any, next: any) => {
	try {
		const { items, amount, reason, otherReason, reference, order, date, note } = req.body;

		const findOrder = await Order.findById(order);

		if (!findOrder) {
			return res.status(400).json({ message: 'Order not found' });
		}

		let totalVat = 0;

		// findOrder.items = findOrder.items.map((item: any) => {
		// 	const returnItem = items.find((i: any) => i._id == item._id);
		// 	if (returnItem) {
		// 		item.returnQty = item.returnQty + Number(returnItem.returnQty);
		// 		const itemReturnPrice = item.unitPrice * Number(returnItem.returnQty);
		// 		item.totalPrice = item.totalPrice - itemReturnPrice;
		// 	}
		// 	return item;
		// }, []);

		findOrder.items = findOrder.items.map((item: any) => {
			const returnItem = items.find((i: any) => i._id == item._id);
			if (returnItem) {
				const returnQty = Number(returnItem.returnQty);
				if (!isNaN(returnQty) && returnQty > 0) {
					item.returnQty = (item.returnQty || 0) + returnQty;
					const itemReturnPrice = (item.unitPrice || 0) * returnQty;
					item.totalPrice = (item.totalPrice || 0) - itemReturnPrice;
					totalVat += (item.unitVat || 0) * returnQty;
				}
			}
			return item;
		});

		findOrder.returnAmount = (findOrder?.returnAmount || 0) + Number(amount) + totalVat;
		findOrder.total = findOrder.total - Number(amount) - totalVat;
		findOrder.dueAmount = (findOrder.dueAmount || 0) - Number(amount) - totalVat;

		if (findOrder.dueAmount <= 0) {
			findOrder.isPaid = true;
		}

		let decreaseProfit = 0;

		for (const item of items) {
			const { _id, qty, returnQty, returnAmount } = item;
			const data = await Product.findById(_id);
			if (data) {
				data.stock += Number(returnQty);
				const profit = data.price - data.cost;
				decreaseProfit += profit * Number(returnQty);
				await data.save();
			}
		}

		findOrder.profit = findOrder.profit - Number(decreaseProfit);

		await findOrder.save();

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
			shop: findOrder?.shop,
		});

		const saved = await newReturn.save();

		return res.status(200).json({ newReturn: saved });
	} catch (e: any) {
		const message = getErrorMessage(e);
		return res.status(500).json({ message });
	}
};

export default adjustReturn;
