import mongoose, { Types } from 'mongoose';
import SettingType from '../../lib/types/settings.types';

export type ProductType = mongoose.Document & {
	name: string;
	description?: string;
	restaurant: Types.ObjectId;
	category: Types.ObjectId;
	image?: string;
	images?: string[];
	price: number;
	isActive: boolean;
	isFeatured: boolean;
	isDeleted: boolean;
	isVisible: boolean;
	collection?: any;
};

export type ProductSettings = {
	name: SettingType;
	description?: SettingType;
	restaurant: SettingType;
	category: SettingType;
	image?: SettingType;
	images?: SettingType;
	price: SettingType;
	isActive: SettingType;
	isFeatured: SettingType;
	isDeleted: SettingType;
	isVisible: SettingType;
	collection?: SettingType;
	isDiscount?: SettingType;
	discountPrice?: SettingType;
	longDescription?: SettingType;
	tags: SettingType;
	time: SettingType;
};
