import { ShopFaqSettings } from './shopFaq.types';

const settings: ShopFaqSettings = {
	question: {
		edit: true,
		title: 'Question',
		type: 'string',
		required: true,
	},

	answer: {
		edit: true,
		title: 'Answers',
		type: 'string',
		required: true,
	},

	// shop: {
	// 	title: 'Shop',
	// 	type: 'string',
	// 	required: true,
	// 	populate: {
	// 		path: 'shop',
	// 		select: '_id name',
	// 	},
	// },

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
	},
};

export default settings;
