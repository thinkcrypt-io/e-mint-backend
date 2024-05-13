import Item from '../../models/items/items.model.js';

const getMenu = async (req: any, res: any) => {
	try {
		const items = await Item.find({
			restaurant: req.params.id,
			isActive: true,
			isDeleted: false,
		})
			.populate('category restaurant')
			.sort('category');
		if (!items) return res.status(404).json({ message: 'Item not found' });

		const categories = items.reduce((acc: any, item: any) => {
			const category: any = item.category;
			const categoryId: any = category._id.toString(); // Convert ObjectId to string
			if (!acc[categoryId]) {
				acc[categoryId] = {
					category: {
						id: categoryId,
						name: category.name,
						description: category.description,
					},
					items: [],
				};
			}
			acc[categoryId].items.push(item);
			return acc;
		}, {});

		const result = Object.values(categories);

		return res.status(200).json(result);
	} catch (e: any) {
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};

export default getMenu;
