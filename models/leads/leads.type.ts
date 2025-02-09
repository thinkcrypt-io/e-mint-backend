import { Document, Schema, Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

type LeadType = DocumentBaseType & {
	name: string;
	email?: string;
	phone?: string;
	category?: string;
	businessName?: string;
	position?: string;
	businessAddress?: string;
	city?: string;
	assignedTo?: string;
	industry?: string;
	facebook?: string;
	instagram?: string;
	hasWebsite?: boolean;
	websiteUrl?: string;
	isActive: boolean;
	group?: string;
	tags?: string[];
	interestedIn?: string[];
	priority: 'low' | 'medium' | 'high';
	estimatedBudget?: number;
	followUps?: [];
	source?:
		| 'website'
		| 'facebook'
		| 'instagram'
		| 'referral'
		| 'other'
		| 'offline'
		| 'email'
		| 'call'
		| 'event'
		| 'search-engine';
	status?:
		| 'new'
		| 'interested'
		| 'contacted'
		| 'qualified'
		| 'attempted-contact'
		| 'unqualified'
		| 'follow-up'
		| 'converted'
		| 'dead'
		| 'open'
		| 'won'
		| 'closed';
	notes?: string[];
	isDeleted?: boolean;
};

export default LeadType;
