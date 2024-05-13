import { Document, Schema } from 'mongoose';

type DocumentBaseType = Document & {
	createdAt: Date;
	updatedAt: Date;
};

export type CollectionType = DocumentBaseType & {
	name: string;
	description?: string;
	isActive: boolean;
	restaurant: Schema.Types.ObjectId;
	image?: string;
	isFeatured: boolean;
	priority: number;
	dataKey: string;
};
