import mongoose, { Schema } from 'mongoose';
import JobPostType from './jobpost.types.js';

const schema = new Schema<JobPostType>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		company: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			trim: true,
			lowercase: true,
		},
		category: {
			type: String,
			trim: true,
		},
		postingDate: {
			type: Date,
			required: true,
			default: Date.now,
		},
		postingMedia: {
			type: String,
			trim: true,
		},
		experienceLevel: {
			type: String,
			enum: ['entry-level', 'mid-level', 'senior-level', 'management', 'other'],
		},
		educationLevel: {
			type: String,
			enum: ['high-school', 'diploma', 'bachelors', 'masters', 'phd', 'other'],
		},
		applicationProcess: {
			type: String,
			trim: true,
		},
		shift: {
			type: String,
			enum: ['morning', 'evening', 'night', 'rotational', 'other'],
		},
		phone: {
			type: String,
			trim: true,
		},
		website: {
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
		country: {
			type: String,
			trim: true,
		},
		industry: {
			type: String,
			trim: true,
		},
		companyDescription: {
			type: String,
			trim: true,
		},
		employmentType: {
			type: String,
			required: true,
			enum: ['full-time', 'part-time', 'contract', 'internship', 'temporary', 'freelance', 'other'],
		},
		jobLocationType: {
			type: String,
			required: true,
			enum: ['remote', 'onsite', 'hybrid'],
		},
		jobLocation: {
			type: String,
			trim: true,
		},
		minSalary: {
			type: Number,
			required: true,
		},
		maxSalary: {
			type: Number,
			required: true,
		},
		salaryType: {
			type: String,
			enum: ['hourly', 'weekly', 'monthly', 'yearly'],
		},
		salaryCurrency: {
			type: String,
			trim: true,
		},
		jobDescription: {
			type: String,
			trim: true,
		},
		requirements: [
			{
				type: String,
				trim: true,
			},
		],
		qualifications: [
			{
				type: String,
				trim: true,
			},
		],
		responsibilities: [
			{
				type: String,
				trim: true,
			},
		],
		tags: [
			{
				type: String,
				trim: true,
			},
		],
		noOfOpenings: {
			type: Number,
			default: 1,
		},
		applicationUrl: {
			type: String,
			trim: true,
		},
		companyLogo: {
			type: String,
			trim: true,
		},
		file: {
			type: String,
			trim: true,
		},
		fileUrl: {
			type: String,
			trim: true,
		},
		skills: [
			{
				type: String,
				trim: true,
			},
		],
		benefits: [
			{
				type: String,
				trim: true,
			},
		],
		addedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Admin',
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		deadline: {
			type: Date,
		},
		status: {
			type: String,
			required: true,
			trim: true,
		},
	},
	{ timestamps: true }
);

const JobPost = mongoose.model<JobPostType>('JobPost', schema);
export default JobPost;
