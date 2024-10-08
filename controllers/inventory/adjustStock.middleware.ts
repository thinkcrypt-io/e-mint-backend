import { Product, ProductType } from '../../imports.js';

const adjustStock = async (req: any, res: any, next: any) => {
	try {
		const { product, change, reason } = req.body;

		const data = (await Product.findById(product)) as any;

		if (data?.stock < change) {
			return res.status(400).json({ message: `Not Enough Stock, stock is ${data?.stock}` });
		}

		const adjust = reason === 'damage' ? -change : change;

		if (reason == 'damage') {
			data.damage += change;
			req.body.value = data?.cost * change;
		}

		if (data?.stock) {
			data.stock += adjust;
		}

		const saved = await data.save();

		if (saved) {
			next();
		}
	} catch (e: any) {
		return res.status(500).json({ message: e.message });
	}
};

export default adjustStock;
