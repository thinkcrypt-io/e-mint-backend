import { Document, Schema, Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

type DocumentType = DocumentBaseType & {
	name: string;
	client?: Types.ObjectId;
	docUrl?: string;
	fileUrl?: string;
	category: string;
	direction: 'inbound' | 'outbound' | 'internal' | 'other';
	tags?: string[];
	project?: Types.ObjectId;
	addedBy: Types.ObjectId;
};

export default DocumentType;
