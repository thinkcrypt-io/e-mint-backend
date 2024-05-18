import mongoose, { Types } from 'mongoose';
import SettingType from '../../lib/types/settings.types';

type BaseProductType = {
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
	isDiscount?: boolean;
	longDescription?: string;
	discountPrice?: number;
	tags: string[];
	time: number;
	createdAt?: Date;
};

export type ProductType = mongoose.Document & BaseProductType;

export type ProductSettings = {
	[K in keyof BaseProductType]: SettingType;
};
