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

		/**
		 * Where this repo is deployed, linked to the console that manages it.
		 *
		 * `hostingServer` above is a free-text note and stays — it predates this
		 * and holds things like "VPS at Hetzner" that have no console. These
		 * fields are the machine-readable version: set only when the repo is
		 * linked to an account this admin actually manages.
		 */
		hostedPlatform: {
			type: String,
			enum: ['vercel', 'heroku'],
		},
		/**
		 * `refPath` rather than a fixed `ref`: the account lives in a different
		 * collection per platform, and hardcoding one would make the other
		 * silently unpopulatable.
		 */
		hostingAccount: {
			type: Schema.Types.ObjectId,
			refPath: 'hostingAccountModel',
		},
		hostingAccountModel: {
			type: String,
			enum: ['VercelAccount', 'HerokuAccount'],
		},
		/** Vercel project id, or Heroku app id. */
		hostedProjectId: {
			type: String,
			trim: true,
		},
		/**
		 * The name the platform's own URLs use — a Heroku app name, a Vercel
		 * project name. Stored alongside the id because the console routes are
		 * built from it and a link should survive the account record being
		 * unreachable.
		 */
		hostedProjectName: {
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
