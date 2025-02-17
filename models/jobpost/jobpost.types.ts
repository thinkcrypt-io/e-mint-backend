import { Document, Schema, Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

type JobPostType = DocumentBaseType & {
	name: string;
	company: string;
	email?: string;
	category?: string;
	postingDate: Date;
	postingMedia?: string;
	experienceLevel?: 'entry-level' | 'mid-level' | 'senior-level' | 'management' | 'other';
	educationLevel?: 'high-school' | 'diploma' | 'bachelors' | 'masters' | 'phd' | 'other';
	applicationProcess?: string;
	shift?: 'morning' | 'evening' | 'night' | 'rotational' | 'other';
	phone?: string;
	website?: string;
	address?: string;
	city?: string;
	country?: string;
	industry?: string;
	companyDescription?: string;
	employmentType:
		| 'full-time'
		| 'part-time'
		| 'contract'
		| 'internship'
		| 'temporary'
		| 'freelance'
		| 'other';
	jobLocationType: 'remote' | 'onsite' | 'hybrid';
	jobLocation?: string;
	minSalary: number;
	maxSalary: number;
	salaryType?: 'hourly' | 'weekly' | 'monthly' | 'yearly';
	salaryCurrency?: string;
	jobDescription?: string;
	requirements?: string[];
	qualifications?: string[];
	responsibilities?: string[];
	tags?: string[];
	noOfOpenings?: number;
	applicationUrl?: string;
	companyLogo?: string;
	skills?: string[];
	benefits?: string[];
	addedBy?: Types.ObjectId;
	isActive: boolean;
	deadline: Date;
	file?: string;
	fileUrl?: string;
	status?:
		| 'draft'
		| 'published'
		| 'archived'
		| 'deleted'
		| 'closed'
		| 'expired'
		| 'open'
		| 'paused'
		| 'pending'
		| 'completed';
};

export default JobPostType;
