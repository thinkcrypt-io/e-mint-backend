import { Types } from 'mongoose';

type AssetType = {
	name: string;
	description?: string;
	price: number;
	image?: string;
	forcedSellPrice?: boolean;
	qty: number;
	isDeleted?: boolean;
	createdAt?: Date;
	note?: string;
	tags?: string[];
	value?: number;
	shop?: Types.ObjectId;
};

export default AssetType;
