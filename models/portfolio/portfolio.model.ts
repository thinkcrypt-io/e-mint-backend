import mongoose, { Schema } from 'mongoose';
import { REGEX } from '../../imports.js';

const schema = new Schema<any>(
	{
		image: {
			type: String,
			required: true,
			// match: REGEX.URL,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		category: {
			type: String,
			required: true,
			lowercase: true,
		},
		status: {
			type: String,
			enum: ['draft', 'published', 'archived'],
			default: 'draft',
			required: true,
		},

		liveUrl: {
			type: String,
			required: true,
			// match: REGEX.URL,
		},

		priority: {
			type: Number,
			default: 1,
			required: true,
		},

		isFeatured: {
			type: Boolean,
			default: false,
			required: true,
		},

		// shortDescription: {
		// 	type: String,
		// 	trim: true,
		// },

		// longDescription: {
		// 	type: String,
		// 	trim: true,
		// },

		// images: [{ type: String, match: REGEX.URL }],

		// overview: {
		// 	title: {
		// 		type: String,
		// 		default: 'Projecct Overview',
		// 	},
		// 	description: String,
		// },
		// challenge: {
		// 	title: {
		// 		type: String,
		// 		default: 'Challenge',
		// 	},
		// 	description: String,
		// },
		// solution: {
		// 	title: {
		// 		type: String,
		// 		default: 'Our Solution',
		// 	},
		// 	description: String,
		// },
		// architecture: {
		// 	title: {
		// 		type: String,
		// 		default: 'Architecture',
		// 	},
		// 	description: String,
		// },

		// deliverables: {
		// 	title: { type: 'String', default: 'Description' },
		// 	description: [String],
		// },

		// technologies: [
		// 	{
		// 		name: String,
		// 		logo: {
		// 			type: String,
		// 			match: REGEX.URL,
		// 		},
		// 		category: {
		// 			type: String,
		// 		},
		// 	},
		// ],

		// sow: {
		// 	title: {
		// 		type: String,
		// 		default: 'Scope of Work',
		// 	},
		// 	description: String,
		// 	items: [
		// 		{
		// 			title: String,
		// 			description: String,
		// 			icon: String,
		// 		},
		// 	],
		// },

		// coreFeatures: {
		// 	title: {
		// 		type: String,
		// 		default: 'Scope of Work',
		// 	},
		// 	description: String,
		// 	items: [
		// 		{
		// 			title: String,
		// 			description: String,
		// 			icon: String,
		// 		},
		// 	],
		// },

		// servicesOffered: [String],

		// tags: [String],

		// slug: {
		// 	type: String,
		// 	trim: true,
		// 	unique: [true, 'Slug must be unique'],
		// 	lowercase: true,
		// 	immutabe: true,
		// },

		// keyFeatures: [
		// 	{
		// 		title: String,
		// 		description: String,
		// 		icon: {
		// 			type: String,
		// 			match: REGEX.URL,
		// 		},
		// 	},
		// ],

		// demoVideo: {
		// 	type: String,
		// 	match: REGEX.URL,
		// },
		// liveUrl: {
		// 	type: String,
		// 	match: REGEX.URL,
		// },

		// timeline: {
		// 	type: String,
		// },

		// startDate: Date,
		// endDate: Date,

		// clientName: String,
		// clientLogo: String,

		// testimonial: String,
		// testimonialAuthor: String,
		// testimonialAuthorDesignation: String,

		// githubUrl: {
		// 	type: String,
		// 	match: REGEX.URL,
		// },
	},
	{
		timestamps: true,
	}
);

const Portfolio = mongoose.model<any>('Portfolio', schema);
export default Portfolio;
