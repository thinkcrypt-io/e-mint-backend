import { Types } from 'mongoose';

type CouponType = {
	name: string;
	description?: string;
	code: string;
	shop?: Types.ObjectId;
	isActive: boolean;
	isFlat: boolean;
	maxAmount: number;
	minOrderValue: number;
	validFrom: Date;
	validTill: Date;
	maxUse: number;
	percentage: number;
	image: string;
	addedBy: Types.ObjectId;
	maxUsePerUser: number;
	user?: Types.ObjectId;
};

export default CouponType;
