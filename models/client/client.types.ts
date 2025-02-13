import { Document, Schema, Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

type ClientType = DocumentBaseType & {
	name: string;
	email?: string;
	phone?: string;
	address?: string;
	city?: string;
	country?: string;
	website?: string;
	industry?: string;
	contactPerson?: string;
	notes?: string[];
	status: {
		type: String;
		enum: ['active', 'inactive', 'pending'];
		default: 'pending';
	};
	description: string;
};

export default ClientType;
