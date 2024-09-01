import { Document, Schema } from 'mongoose';

type DocumentBaseType = Document & {
	createdAt: Date;
	updatedAt: Date;
};

export type CollectionType = DocumentBaseType & {
	name: string;
	description?: string;
	displayInHome: boolean;
	displayInMenu: boolean;
	isActive: boolean;
	image?: string;
	isFeatured: boolean;
	priority: number;
	dataKey?: string;
	images?: string[];
	meta?: {
		title: string;
		description: string;
		keywords: string[];
	};
};
