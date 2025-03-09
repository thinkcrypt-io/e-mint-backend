import { Types } from 'mongoose';

type LeaveType = {
	code?: string;
	employee: Types.ObjectId;
	leaveType: 'annual' | 'sick' | 'casual' | 'unpaid' | 'half-day';
	startDate: Date;
	endDate?: Date;
	numberOfDays: number;
	reason?: string;
	status: 'pending' | 'approved' | 'rejected' | 'cancelled';
	addedBy?: Types.ObjectId;
	access?: Types.ObjectId[];
	attachment?: string;
	createdAt?: Date;
	updatedAt?: Date;
};

export default LeaveType;
