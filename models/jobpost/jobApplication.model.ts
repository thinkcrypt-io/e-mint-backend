import mongoose, { Schema } from 'mongoose';
import JobApplicationType from './jobApplication.types';

const schema = new Schema<JobApplicationType>(
	{
		// Basic Info
		jobPost: {
			type: Schema.Types.ObjectId,
			ref: 'JobPost',
			required: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			// required: true,
			trim: true,
			lowercase: true,
		},
		phone: {
			type: String,
			trim: true,
		},
		address: {
			type: String,
			trim: true,
		},
		city: {
			type: String,
			trim: true,
		},

		// Resume
		coverLetter: {
			type: String,
			trim: true,
		},
		resume: {
			type: String,
			trim: true,
		},
		resumeUrl: {
			type: String,
			trim: true,
		},

		// Education
		educationLevel: {
			type: String,
			enum: ['high-school', 'diploma', 'bachelors', 'masters', 'phd', 'other'],
		},
		school: {
			type: String,
			trim: true,
		},
		college: {
			type: String,
			trim: true,
		},
		degree: {
			type: String,
			trim: true,
		},
		university: {
			type: String,
			trim: true,
		},
		passingYear: {
			type: String,
			trim: true,
		},

		// Experience
		portfolioUrl: {
			type: String,
			trim: true,
		},
		linkedin: {
			type: String,
			trim: true,
		},
		github: {
			type: String,
			trim: true,
		},
		facebook: {
			type: String,
			trim: true,
		},
		website: {
			type: String,
			trim: true,
		},
		expectedSalary: {
			type: Number,
		},

		// Application Status
		status: {
			type: String,
			required: true,
			enum: [
				'applied',
				'pending',
				'reviewed',
				'shortlisted',
				'called',
				'interview-scheduled',
				'interviewed',
				'offer-accepted',
				'offer-declined',
				'recalled',
				'offer-sent',
				'rejected',
				'hired',
				'deleted',
				'expired',
			],
			default: 'applied',
		},
		appliedAt: {
			type: Date,

			default: Date.now,
		},
		appliedFrom: {
			type: String,
			required: true,
			enum: ['linkedin', 'email', 'facebook', 'applicationUrl', 'referral', 'other'],
		},

		// Internal Use
		experienceLevel: {
			type: String,
			enum: ['entry-level', 'mid-level', 'senior-level', 'management', 'other'],
		},
		skills: [
			{
				type: String,
				trim: true,
			},
		],
		notes: {
			type: String,
			trim: true,
		},
		tags: [
			{
				type: String,
				trim: true,
			},
		],
		fit: {
			type: String,
		},
	},
	{ timestamps: true }
);

const JobApplication = mongoose.model<JobApplicationType>('JobApplication', schema);
export default JobApplication;
