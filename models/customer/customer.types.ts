import { Document, Schema } from 'mongoose';

type DocumentBaseType = Document & {
	createdAt: Date;
	updatedAt: Date;
};

type CustomerType = DocumentBaseType & {
	name: string;
	email: string;
	phone?: string;
	// store?: Schema.Types.ObjectId;
	// role: Schema.Types.ObjectId;
	isActive: boolean;
	password: string;
	isRegisteredOnline: boolean;
	tags?: string[];
	notes?: string[];
	isSubscribedToEmail?: boolean;
	isSubscribedToTextMessages?: boolean;
	lastOnline?: Date;
	isDeleted?: boolean;
	generateAuthToken: () => string;
};

export default CustomerType;
