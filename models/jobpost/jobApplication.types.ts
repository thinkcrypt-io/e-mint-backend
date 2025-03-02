import { Document, Schema, Types } from 'mongoose';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

type Status =
	| 'applied'
	| 'pending'
	| 'reviewed'
	| 'shortlisted'
	| 'called'
	| 'interview-scheduled'
	| 'interviewed'
	| 'offer-accepted'
	| 'offer-declined'
	| 'recalled'
	| 'offer-sent'
	| 'rejected'
	| 'hired'
	| 'deleted'
	| 'expired';

type JobPostType = DocumentBaseType & {
	//basic
	jobPost: Types.ObjectId;
	name: string;
	email: string;
	phone: string;
	address?: string;
	city?: string;
	fit?: 'good' | 'average' | 'poor' | 'not-fit';

	//resume
	coverLetter?: string;
	resume?: string;
	resumeUrl?: string;

	//education
	educationLevel?: 'high-school' | 'diploma' | 'bachelors' | 'masters' | 'phd' | 'other';
	school?: string;
	college?: string;
	degree?: string;
	university?: string;
	passingYear?: string;
	scheduledAt?: Date;

	//experience
	portfolioUrl?: string;
	linkedin?: string;
	github?: string;
	facebook?: string;
	website?: string;
	expectedSalary?: number;

	//application status
	status: Status;
	appliedAt: Date;
	appliedFrom: 'linkedin' | 'email' | 'facebook' | 'applicationUrl' | 'referral' | 'other';

	//for internal use
	experienceLevel?: 'entry-level' | 'mid-level' | 'senior-level' | 'management' | 'other';
	skills?: string[];
	notes?: string;
	tags?: string[];
};

export default JobPostType;
