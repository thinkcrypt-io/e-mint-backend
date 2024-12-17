import SettingType from '../../lib/types/settings.types.js';
import { required } from 'joi';
import mongoose, { Schema, Types } from 'mongoose';
// import { CategoryType } from './category.type.js';

type DeploymentType = {
	shop: Types.ObjectId;
	slug: string;
	domain?: string;
	vercelDomain: string;
	vercelURI?: string;
	gitRepo: string;
	gitBranch?: string;
	gitOrg?: string;
	theme?: string;
	shopId: string;
	vercelId: string;
	vercelName: string;
	deployUrl?: string;
	deploymentId?: string;
};

const schema = new Schema<DeploymentType>(
	{
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},
		shopId: {
			type: String,
			required: true,
		},
		deploymentId: String,
		vercelId: {
			type: String,
			required: true,
		},
		deployUrl: String,
		vercelName: {
			type: String,
			required: true,
		},
		slug: {
			type: String,
			required: true,
		},
		domain: String,
		vercelDomain: String,
		vercelURI: String,
		gitRepo: {
			type: String,
			required: true,
		},
		gitBranch: String,
		gitOrg: String,
		theme: String,
	},

	{
		timestamps: true,
	}
);

const Deployment = mongoose.model<DeploymentType>('Deployment', schema);
// export { default as settings } from './expense.settings.js';
export default Deployment;

type Settings = {
	[key: string]: SettingType;
};

export const settings: Settings = {
	slug: {
		search: true,
		title: 'Slug',
		type: 'string',
		required: true,
		trim: true,
	},
	theme: {
		search: true,
		title: 'Theme',
		type: 'string',
		required: true,
		trim: true,
	},
};
