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
	group: Schema.Types.ObjectId;
	isRegisteredOnline: boolean;
	tags?: string[];
	notes?: string[];
	isSubscribedToEmail?: boolean;
	isSubscribedToTextMessages?: boolean;
	lastOnline?: Date;
	isDeleted?: boolean;
	generateAuthToken: () => string;
	shop?: Schema.Types.ObjectId;
};

export default CustomerType;
