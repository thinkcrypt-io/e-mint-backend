import mongoose, { Schema } from 'mongoose';

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

		isVideoEnabled: {
			type: Boolean,
			default: false,
		},

		videoURL: {
			type: String,
		},
		thumbnail: {
			type: String,
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
		//
		images: [String],

		client: {
			type: String,
			trim: true,
		},
		shortDescription: {
			type: String,
			trim: true,
		},
		logo: {
			type: String,
			trim: true,
		},
		coverImage: {
			type: String,
		},
		title: {
			type: String,
			trim: true,
		},
		overview: {
			type: String,
			trim: true,
		},
		subTitle: {
			type: String,
			trim: true,
		},
		longDescription: String,
		tags: [String],

		challengeTitle: {
			type: String,
			trim: true,
		},

		challengeDescription: {
			type: String,
			trim: true,
		},

		productTitle: {
			type: String,
			trim: true,
		},

		productDescription: {
			type: String,
			trim: true,
		},

		companyName: {
			type: String,
			trim: true,
		},

		companyTitle: {
			type: String,
			trim: true,
		},

		companyDescription: {
			type: String,
			trim: true,
		},

		companyCategory: {
			type: String,
			trim: true,
		},

		companyUrl: {
			type: String,
			trim: true,
		},

		approachTitle: {
			type: String,
			trim: true,
		},

		approachDescription: {
			type: String,
			trim: true,
		},

		solutionTitle: {
			type: String,
			trim: true,
		},

		solutionDescription: {
			type: String,
			trim: true,
		},

		solutionFeatures: [{ title: String, description: String }],

		showCaseStudy: {
			type: Boolean,
			default: false,
		},

		showLiveUrl: {
			type: Boolean,
			default: false,
		},

		techStackTitle: String,
		techStackDescription: String,
		techStack: [String],
		review: String,
		duration: String,
		year: String,

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
