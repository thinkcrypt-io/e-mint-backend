import { Settings } from '../../imports.js';
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
			brandColor: {
				type: String,
				default: '#202020',
			},
			brandTextColor: {
				type: String,
				default: '#fff',
			},
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
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
				titleColor: {
					type: String,
					default: '#000',
				},
				subTitleColor: {
					type: String,
					default: '#000',
				},
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
				title: {
					type: String,
					default: '',
				},
				subTitle: {
					type: String,
					default: '',
				},
				image: String,
				btnText: {
					type: String,
					default: 'Read More',
				},
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

export const contentSettings: Settings = {
	basic: {
		type: 'array-object',
		title: 'Basic',
		edit: true,
	},

	content: {
		type: 'array-object',
		title: 'Content',
		edit: true,
	},
	isActive: {
		type: 'boolean',
		title: 'Is Active',
		edit: true,
	},
	shop: {
		type: 'string',
		title: 'Shop',
		edit: true,
	},
	socials: {
		type: 'object',
		title: 'Socials',
		edit: true,
	},
};

const Store = mongoose.model<any>('Store', schema);
export default Store;
