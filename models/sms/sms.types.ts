import { Types } from 'mongoose';

type SMSType = {
	shop: Types.ObjectId;
	message: string;
	count: number;
	sentBy?: Types.ObjectId;
	recipient: string;
	status: 'pending' | 'sent' | 'failed';
	createdAt?: Date;
	source: 'shop' | 'inventory' | 'order' | 'customer' | 'otp';
	isDeleted?: boolean;
	rate: number;
};

export default SMSType;
