import mongoose from 'mongoose';
import Collection from '../../models/collection/collection.model.js';

const getCollectionMenu = async (req: any, res: any) => {
	try {
		const id = req.params.id;
		const collections = await Collection.aggregate([
			{
				$match: {
					restaurant: id, // match collections where restaurant equals id
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
		]);

		return res.status(200).json(collections);
	} catch (e: any) {
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};

export default getCollectionMenu;
