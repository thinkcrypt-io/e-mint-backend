import mongoose, { Document, Schema, Types } from 'mongoose';
import ProjectType from './types';

const schema = new Schema<ProjectType>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
			minlength: 3,
			maxlength: 50,
		},
		projectType: {
			type: String,
			enum: ['frontend', 'backend', 'fullstack', 'android', 'ios', 'admin', 'other'],
		},
		category: {
			type: String,
			required: true,
			trim: true,
		},
		clientName: {
			type: String,
			trim: true,
		},
		client: {
			type: Schema.Types.ObjectId,
			ref: 'Client',
		},
		project: {
			type: Schema.Types.ObjectId,
			ref: 'Software',
		},
		devUrl: {
			type: String,
			trim: true,
		},
		liveUrl: {
			type: String,
			trim: true,
		},
		testUrl: {
			type: String,
			trim: true,
		},
		prodUrl: {
			type: String,
			trim: true,
		},
		githubUrl: {
			type: String,
			trim: true,
		},
		domain: {
			type: String,
			trim: true,
		},
		hostingServer: {
			type: String,
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		status: {
			type: String,
			trim: true,
		},
		technologies: [
			{
				type: String,
				trim: true,
			},
		],
		frameworks: [
			{
				type: String,
				trim: true,
			},
		],
		libraries: [
			{
				type: String,
				trim: true,
			},
		],
	},
	{ timestamps: true }
);

const Project = mongoose.model<ProjectType>('Project', schema);
export default Project;
