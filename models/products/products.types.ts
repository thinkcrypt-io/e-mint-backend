import mongoose, { Types } from 'mongoose';
import SettingType from '../../lib/types/settings.types';

type BaseProductType = {
	name: string;
	shortDescription?: string;
	description?: string;
	isActive: boolean;
	image?: string;
	images?: string[];
	category: Types.ObjectId;
	collection: any;
	isFeatured: boolean;
	price: number;
	isDiscount: boolean;
	discount?: number;
	sku?: string;
	slug?: string;
	weight?: number;
	dimensions?: { length: number; width: number; height: number };
	barcode?: string;
	tags?: string[];
	stock?: number;
	unit?: string;
	unitValue?: number;
	customAttributes?: { label: string; value: string }[];
	customSections?: { title: string; description: string }[];
	extraAttributes?: { key: string; value: string }[];
	discountedPrice?: number;
	vat?: number;
	isVisible: boolean;
	supplier?: string;
	isDeleted: boolean;
	meta?: { title: string; description: string; keywords: string[] };
	faq?: { question: string; answer: string }[];
	createdAt?: Date;
};

export type ProductType = mongoose.Document & BaseProductType;

export type ProductSettings = {
	[K in keyof BaseProductType]: SettingType;
};
