import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		basic: {
			name: { type: String, required: true, default: 'Mint Store' },
			logo: {
				type: String,
			},
			phone: {
				type: String,
				default: '+880 1828 398 225',
			},
			email: {
				type: String,
				default: 'asifistiaque.ai@gmail.com',
			},
		},

		socials: {
			facebook: String,
			twitter: String,
			instagram: String,
			linkedin: String,
			pinterest: String,
			youtube: String,
		},
		content: {
			hero: {
				image: String,
				title: String,
				subTitle: String,
				btnText: String,
				href: String,
			},
			featuredCollection: [
				{
					title: String,
					// type: {
					// 	type: String,
					// 	enum: ['categories', 'collections', 'products'],
					// 	required: true,
					// },
					// href: {
					// 	type: String,
					// 	required: true,
					// },
					subTitle: String,
					image: String,
					priority: {
						type: Number,
						default: 0,
					},
				},
			],
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
