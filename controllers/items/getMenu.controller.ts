import Collection from '../../models/collection/collection.model.js';
import Item from '../../models/items/items.model.js';
import Scan from '../../models/scan/scan.model.js';
import mongoose from 'mongoose';

const getMenu = async (req: any, res: any) => {
	const id = req.params.id;
	try {
		const items = await Item.find({
			restaurant: id,
			isActive: true,
			isDeleted: false,
		})
			.populate('category restaurant')
			.sort('category');
		if (!items) return res.status(404).json({ message: 'Item not found' });

		const scan = new Scan({
			value: 1,
			restaurant: req.params.id,
			device: req.headers['user-agent'],
			ip: req.ip,
		});

		await scan.save();

		const collections = await Collection.aggregate([
			{
				$match: {
					restaurant: new mongoose.Types.ObjectId(id), // match collections where restaurant equals id
				},
			},
			{
				$lookup: {
					from: 'items', // name of the items collection
					localField: '_id',
					foreignField: 'collection',
					as: 'items',
				},
			},
			{
				$unwind: {
					path: '$items',
					preserveNullAndEmptyArrays: true, // keep collections with no items
				},
			},
			{
				$match: {
					'items.isActive': true, // match items where isActive is true
				},
			},
			{
				$match: {
					items: { $exists: true }, // match collections where items array is not empty
				},
			},
			{
				$group: {
					_id: '$_id', // group by collection id
					category: {
						$first: {
							id: '$_id',
							name: '$name',
							description: '$description',
							// include other collection fields as needed
						},
					},
					items: {
						$push: '$items', // reconstruct items array
					},
				},
			},
		]);

		const categories = items.reduce((acc: any, item: any) => {
			const category: any = item.category;
			const categoryId: any = category._id.toString(); // Convert ObjectId to string
			if (!acc[categoryId]) {
				acc[categoryId] = {
					category: {
						id: categoryId,
						name: category.name,
						description: category.description,
						priority: category.priority,
					},
					items: [],
				};
			}
			acc[categoryId].items.push(item);
			return acc;
		}, {});

		// Convert the categories object to an array
		const categoriesArray = Object.values(categories);

		// Sort the categories array by the priority field in descending order
		categoriesArray.sort((a: any, b: any) => b.category.priority - a.category.priority);

		// const result = Object.values(categories);

		return res.status(200).json([...collections, ...categoriesArray]);
	} catch (e: any) {
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};

export default getMenu;
