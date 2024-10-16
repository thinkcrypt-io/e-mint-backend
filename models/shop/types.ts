import { Types } from 'mongoose';

type ShopType = {
	id: string;
	name: string;
	description: string;
	template?: number;
	logo?: string;
	image?: string;
	coverImage?: string;
	location?: string;
	address?: string;
	email: string;
	expire: Date;
	trial: boolean;
	phone: string;
	package?: any;
	isDeleted?: boolean;
	isActive: boolean;
	createdAt: Date;
	owner: Types.ObjectId;
};

export default ShopType;
