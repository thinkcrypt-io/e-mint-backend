//

import { Document, Types } from 'mongoose';
import SettingsType from '../../lib/types/settings.types';

type BaseLeaveType = {
	employee: Types.ObjectId;
	leaveType: 'annual' | 'sick' | 'hd' | 'maternity' | 'casual' | 'ul' | 'other';
	startDate: Date;
	endDate: Date;
	status: 'pending' | 'approved' | 'rejected' | 'cancelled';
	reason: string;
	days: number;
	approvedBy: Types.ObjectId;
	appliedOn: Date;
	comments: string;
	isActive: boolean;
	createdAt?: Date;
	updatedAt?: Date;
	trackingId: string;
};

type LeaveType = Document & BaseLeaveType;

export type LeaveSettingsType = {
	[P in keyof BaseLeaveType]: SettingsType;
};

export default LeaveType;
