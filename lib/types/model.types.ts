import { Document, Schema } from 'mongoose';

type DocumentBaseType = Document & {
	createdAt: Date;
	updatedAt: Date;
};

type Meta = {
	meta?: {
		title: string;
		description: string;
	};
};

export type ConfigType = {
	edit?: boolean;
	sort?: boolean;
	search?: boolean;
	populate?: boolean;
	duplicate?: boolean;
	filters?: {
		name: string;
		field?: string;
		type: string;
		label: string;
		title: string;
	};
	validator?: {
		title?: string;
		type: string;
		min?: number;
		max?: number;
		required?: boolean;
		insertOnly?: boolean;
	};
};
