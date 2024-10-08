import { filters, Settings } from '../../imports.js';
import mongoose, { Schema } from 'mongoose';

type BrandType = {
	name: string;
	image: string;
	description: string;
	isActive: boolean;
	tags: string[];
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
	},
	image: {
		edit: true,
		title: 'Image',
		type: 'uri',
	},
	description: {
		edit: true,
		title: 'Description',
		type: 'string',
	},
	createdAt: {
		title: 'Created At',
		type: 'string',
		edit: false,
		sort: true,
		filter: filters.createdAt,
	},
	tags: {
		edit: true,
		title: 'Tags',
		type: 'array-string',
		sort: true,
		filter: filters.tags,
	},
};

const Brand = mongoose.model<BrandType>('Brand', schema);
export default Brand;
