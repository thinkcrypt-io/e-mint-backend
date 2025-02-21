import { Document, Schema, Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

type SoftwareType = DocumentBaseType & {
	name: string;
	descrption?: string;
	category?: string;
	client?: Types.ObjectId;
	description?: string;
	status?: string;
	isActive?: boolean;
	access?: Types.ObjectId[];
	addedBy?: Types.ObjectId;
	startDate?: Date;
	endDate?: Date;
	deadline?: Date;
	tags?: string[];
	requirements?: string;
	file?: string;
	fileUrl?: string;
	createdAt?: Date;
};

export default SoftwareType;
