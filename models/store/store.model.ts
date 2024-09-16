import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: { type: String, required: true, default: 'Mint Store' },
		logo: {
			type: String,
		},
		content: {
			hero: {
				image: String,
				title: String,
				subTitle: String,
				btnText: String,
				href: String,
			},
			collections: {
				title: {
					type: String,
					default: 'Collections',
				},
				subTitle: {
					type: String,
					default: 'Discover our collection',
				},
				btnText: {
					type: String,
					default: 'View All',
				},
				items: [
					{
						id: {
							type: mongoose.Schema.Types.ObjectId,
							required: true,
						},

						type: {
							type: String,
							enum: ['categories', 'collections'],
							required: true,
						},
					},
				],
			},
			productList: [
				{
					id: {
						type: mongoose.Schema.Types.ObjectId,
						required: true,
					},
					title: String,
					subTitle: String,
					priority: {
						type: Number,
						default: 0,
					},
					type: {
						type: String,
						default: 'category',
						enum: ['category', 'collection'],
						required: true,
					},
				},
			],
			discover: {
				title: String,
				subTitle: String,
				items: [
					{
						btnText: String,
						href: String,
						image: String,
					},
				],
			},
			about: {
				title: String,
				subTitle: String,
				image: String,
				btnText: String,
			},
		},
		isActive: { type: Boolean, required: true, default: true },
	},

	{
		timestamps: true,
		toJSON: { virtuals: true }, // Include this line to ensure virtuals are included when converting to JSON
		toObject: { virtuals: true }, // Include this line to ensure virtuals are included when converting to objects
	}
);

const Store = mongoose.model<any>('Store', schema);
export default Store;

// export { default as filters } from './filters.js';
//export { default as config } from './config.js';
// export { default as settings } from './products.settings.js';
