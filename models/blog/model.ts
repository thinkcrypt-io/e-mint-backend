import mongoose, { Schema, Document } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib/functions/index.js';

const BlogSchema = new Schema<any>(
	{
		name: {
			type: String,
			required: [true, 'Blog name is required'],
			trim: true,
			maxlength: [200, 'Name cannot exceed 200 characters'],
			minlength: [10, 'Name must be at least 10 characters'],
		},
		excerpt: {
			type: String,
			required: [true, 'Blog excerpt is required'],
			trim: true,
			maxlength: [300, 'Excerpt cannot exceed 300 characters'],
			minlength: [50, 'Excerpt must be at least 50 characters'],
		},
		content: {
			type: String,
			required: [true, 'Blog content is required'],
			minlength: [500, 'Content must be at least 500 characters'],
		},
		author: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Author',
			required: [true, 'Author is required'],
		},
		publishedAt: {
			type: Date,
			default: null,
			required: [true, 'Publist Date is required'],
		},
		readTime: {
			type: String,
			required: [true, 'Read time is required'],
		},
		tags: {
			type: [String],
			required: [true, 'At least one tag is required'],
			validate: {
				validator: function (tags: any) {
					return tags.length >= 1 && tags.length <= 10;
				},
				message: 'Blog must have between 1 and 10 tags',
			},
		},
		image: {
			type: String,
			required: [true, 'Featured image is required'],
		},
		coverImage: {
			type: String,
		},
		images: {
			type: [String],
			default: [],
		},
		slug: {
			type: String,
			required: [true, 'Slug is required'],
			unique: true,
			trim: true,
			lowercase: true,
		},
		views: {
			type: Number,
			default: 0,
			min: [0, 'Views cannot be negative'],
		},
		likes: {
			type: Number,
			default: 0,
			min: [0, 'Likes cannot be negative'],
		},
		status: {
			type: String,
			enum: ['published', 'draft', 'archived'],
			default: 'draft',
			required: true,
		},
		isFeatured: {
			type: Boolean,
			default: false,
		},
		metaTitle: {
			type: String,
			trim: true,
			maxlength: [60, 'Meta title cannot exceed 60 characters'],
		},
		metaDescription: {
			type: String,
			trim: true,
			maxlength: [160, 'Meta description cannot exceed 160 characters'],
		},
		metaKeywords: {
			type: [String],
			// validate: {
			// 	validator: function (keywords: any) {
			// 		return keywords.length <= 15;
			// 	},
			// 	message: 'Cannot have more than 15 meta keywords',
			// },
		},
		category: {
			type: String,
			required: [true, 'Category is required'],
			trim: true,
		},
		code: {
			type: String,
			unique: true,
			trim: true,
		},

		allowComments: {
			type: Boolean,
			default: true,
		},
		seoScore: {
			type: Number,
			min: 0,
			max: 100,
			default: 0,
		},
		contentScore: {
			type: Number,
			min: 0,
			max: 100,
			default: 0,
		},

		scheduledAt: {
			type: Date,
			default: null,
		},
		isDeleted: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

// Indexes
BlogSchema.index({ slug: 1 }, { unique: true });
BlogSchema.index({ author: 1 });
BlogSchema.index({ status: 1 });
BlogSchema.index({ publishedAt: -1 });
BlogSchema.index({ category: 1, status: 1 });
BlogSchema.index({ tags: 1 });
BlogSchema.index({ createdAt: -1 });

// Text search index
BlogSchema.index({
	name: 'text',
	excerpt: 'text',
	content: 'text',
	tags: 'text',
});

// Pre-save middleware
BlogSchema.pre('save', function (next) {
	const doc = this as any;

	if (!doc.slug && doc.name) doc.slug = generateSlug(doc.name);

	// if (doc.status === 'published' && !doc.publishedAt) {
	// 	doc.publishedAt = new Date();
	// }

	if (!doc.metaTitle) {
		doc.metaTitle = doc.name ? doc.name.substring(0, 60) : '';
	}

	if (!doc.metaDescription) {
		doc.metaDescription = doc.excerpt ? doc.excerpt.substring(0, 160) : '';
	}

	next();
});

// Pre-save hook to auto-increment the document code
BlogSchema.pre<any>(
	'save',
	addSequentialCodeMiddleware({
		slug: 'document',
		prefix: 'DOC',
		initialValue: 40,
		padding: 4,
	})
);

export default mongoose.model<any>('Blog', BlogSchema);
