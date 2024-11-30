import { Types } from 'mongoose';

type PaymentAccountType = {
	name: string;
	accountNumber: string;
	accountType: string;
	balance: number;
	customAttributes?: [
		{
			label: { type: String };
			value: { type: String };
		}
	];
	tags?: string[];
	shop?: Types.ObjectId;
	isDeleted?: boolean;
	createdAt?: Date;
	note?: string;
	bankName?: string;
	branchName?: string;
};

export default PaymentAccountType;
