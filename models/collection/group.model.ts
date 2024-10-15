import mongoose, { Schema, Types } from 'mongoose';
import { SettingsType } from '../../imports.js';

type GroupType = {
	name: string;
	description: string;
	image: string;
	images: string[];
	shop?: Types.ObjectId;
};

const schema = new Schema<GroupType>(
	{
		name: {
			type: String,
			trim: true,
			required: [true, 'Name is required'],
		},

		description: {
			type: String,
			trim: true,
		},

		image: {
			type: String,
			trim: true,
		},
		images: [
			{
				type: String,
				trim: true,
			},
		],
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},
	},

	{
		timestamps: true,
	}
);

export const groupSettings: SettingsType<GroupType> = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		min: 3,
		max: 50,
		required: true,
		trim: true,
		unique: true,
	},
	description: {
		edit: true,
		title: 'Description',
		type: 'string',
		min: 10,
		max: 50,
		trim: true,
	},
	image: {
		edit: true,
		title: 'Image',
		type: 'uri',
	},

	images: {
		type: 'array-string',
		title: 'Image',
		edit: true,
	},
};

const Group = mongoose.model<GroupType>('Group', schema);

export default Group;
