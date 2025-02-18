import { filters, Settings } from '../../imports.js';
import mongoose, { Schema } from 'mongoose';

type BrandType = {
	name: string;
	image: string;
	description: string;
	isActive: boolean;
	tags: string[];
	shop: Schema.Types.ObjectId;
};

const schema = new Schema<BrandType>(
	{
		name: {
			type: String,
			trim: true,
			required: true,
		},
		image: {
			type: String,
			trim: true,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},
		description: {
			type: String,
			trim: true,
		},
		tags: [String],
	},
	{
		timestamps: true,
	}
);

export const settings: Settings = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
		unique: true,

		schema: {
			sort: true,
			default: true,
			displayInTable: true,
		},
	},
	image: {
		edit: true,
		title: 'Image',
		type: 'uri',
		schema: {
			type: 'image',
			tableType: 'text',
		},
	},
	description: {
		edit: true,
		title: 'Description',
		type: 'string',
		schema: {
			type: 'textarea',
			displayInTable: true,
		},
	},
	createdAt: {
		title: 'Created At',
		type: 'string',
		edit: false,
		sort: true,
		filter: {
			name: 'createdAt',
			field: 'createdAt',
			type: 'date',
			label: 'Created At',
			title: 'Sort by created at',
		},
		schema: {
			type: 'date',
			sort: true,
			default: true,
			displayInTable: true,
		},
	},
	tags: {
		edit: true,
		title: 'Tags',
		type: 'array-string',
		sort: true,
		schema: {
			displayInTable: true,
		},
		// filter: filters.tags,
	},
};

const Brand = mongoose.model<BrandType>('Brand', schema);
export default Brand;
