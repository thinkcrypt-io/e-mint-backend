import { Types } from 'mongoose';
import SettingType from '../../lib/types/settings.types';
import { Document } from 'mongodb';

export type CategoryType = Document & {
	_id?: string;
	name: string;
	description?: string;
	shortDescription?: string;
	longDescription?: string;
	restaurant: Types.ObjectId;
	isActive: boolean;
	isDeleted?: boolean;
	image?: string;
	createdAt?: Date;
	updatedAt?: Date;
	priority: number;
	parentCategory?: Types.ObjectId;
};

export type CategorySettings = {
	name: SettingType;
	description: SettingType;
	shortDescription?: SettingType;
	isActive: SettingType;
	parentCategory?: SettingType;
	isDeleted?: SettingType;
	isFeatured: SettingType;
	image: SettingType;
	createdAt?: SettingType;
	priority: SettingType;
	parent?: SettingType;
	slug: SettingType;
	longDescription?: SettingType;
	tags: SettingType;
	displayInMenu: SettingType;
	displayInHomePage: SettingType;
	meta: SettingType;
	metaImage: SettingType;
	metaKeywords: SettingType;
};
