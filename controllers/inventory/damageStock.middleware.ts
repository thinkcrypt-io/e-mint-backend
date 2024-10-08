import { Product, ProductType } from '../../imports.js';

const adjustStock = async (req: any, res: any, next: any) => {
	try {
		const { product, change, reason } = req.body;

		const data = (await Product.findById(product)) as ProductType;

		if (product?.stock < change) {
			return res.status(400).json({ message: 'Not enough stock' });
		}

		const adjust = reason === 'damage' ? -change : change;

		if (data?.stock) {
			data.stock += adjust;
		}

		const saved = await data.save();

		if (saved) {
			next();
		}
	} catch (e: any) {
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};

export default adjustStock;
