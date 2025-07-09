import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		// Basic Content Information
		name: {
			type: String,
			required: true,
			trim: true,
			maxlength: 200,
		},
		title: {
			type: String,
			trim: true,
			maxlength: 300,
		},
		slug: {
			type: String,
			trim: true,
			lowercase: true,
		},

		// Content Type & Classification
		contentType: {
			type: String,
			required: true,
			enum: [
				'page',
				'blog',
				'article',
				'product',
				'service',
				'portfolio',
				'testimonial',
				'team',
				'faq',
				'news',
				'event',
				'gallery',
				'video',
				'document',
				'banner',
				'popup',
				'footer',
				'header',
				'sidebar',
				'widget',
				'form',
				'custom',
			],
			index: true,
		},
		category: {
			type: Schema.Types.ObjectId,
			ref: 'Category',
		},
		tags: [
			{
				type: String,
				trim: true,
			},
		],

		// Content Value (Dynamic based on content type)
		content: {
			// Rich text content (HTML/Markdown)
			body: {
				type: String,
				trim: true,
			},
			excerpt: {
				type: String,
				trim: true,
				maxlength: 500,
			},
			// Structured content blocks
			blocks: [
				{
					type: {
						type: String,
						enum: [
							'text',
							'image',
							'video',
							'gallery',
							'button',
							'form',
							'embed',
							'code',
							'quote',
							'list',
							'table',
							'separator',
							'custom',
						],
					},
					content: Schema.Types.Mixed,
					order: Number,
					settings: Schema.Types.Mixed,
				},
			],
			// Raw JSON for flexible content structure
			data: Schema.Types.Mixed,
		},

		// Media & Assets
		featuredImage: {
			url: String,
			alt: String,
			caption: String,
			width: Number,
			height: Number,
		},
		gallery: [
			{
				url: String,
				alt: String,
				caption: String,
				order: Number,
			},
		],
		attachments: [
			{
				name: String,
				url: String,
				type: String,
				size: Number,
			},
		],

		// SEO & Meta Information
		seo: {
			metaTitle: {
				type: String,
				maxlength: 60,
			},
			metaDescription: {
				type: String,
				maxlength: 160,
			},
			keywords: [String],
			canonicalUrl: String,
			noIndex: {
				type: Boolean,
				default: false,
			},
			noFollow: {
				type: Boolean,
				default: false,
			},
		},

		// Page & Location Association
		page: {
			type: Schema.Types.ObjectId,
			ref: 'Page',
		},
		pageSection: {
			type: String,
			enum: ['header', 'hero', 'main', 'sidebar', 'footer', 'popup', 'custom'],
			default: 'main',
		},
		position: {
			type: Number,
			default: 0,
		},

		// Publishing & Workflow
		status: {
			type: String,
			enum: ['draft', 'published', 'scheduled', 'archived', 'trash'],
			default: 'draft',
			index: true,
		},
		publishedAt: Date,
		scheduledAt: Date,
		expiresAt: Date,

		lastModifiedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
		},
		version: {
			type: Number,
			default: 1,
		},
		parentId: {
			type: Schema.Types.ObjectId,
			ref: 'Content', // For content revisions
		},

		// Language & Localization
		language: {
			type: String,
			default: 'en',
		},
		translations: [
			{
				language: String,
				contentId: {
					type: Schema.Types.ObjectId,
					ref: 'Content',
				},
			},
		],

		// Dynamic Fields & Custom Attributes
		customFields: {
			type: Map,
			of: Schema.Types.Mixed,
		},
		settings: {
			type: Map,
			of: Schema.Types.Mixed,
		},

		// Analytics & Performance
		views: {
			type: Number,
			default: 0,
		},
		likes: {
			type: Number,
			default: 0,
		},
		shares: {
			type: Number,
			default: 0,
		},
		comments: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Comment',
			},
		],

		// Template & Layout
		template: {
			type: String,
			trim: true,
		},
		layout: {
			type: String,
			trim: true,
		},

		// Content Features
		featuresEnabled: {
			comments: {
				type: Boolean,
				default: false,
			},
			sharing: {
				type: Boolean,
				default: true,
			},
			rating: {
				type: Boolean,
				default: false,
			},
			subscription: {
				type: Boolean,
				default: false,
			},
		},

		// Status & Flags
		isActive: {
			type: Boolean,
			default: true,
		},
		isFeatured: {
			type: Boolean,
			default: false,
		},
		isSticky: {
			type: Boolean,
			default: false,
		},
		isLocked: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

// Indexes for Performance
schema.index({ contentType: 1, status: 1 });
schema.index({ slug: 1 }, { unique: true });
schema.index({ author: 1, status: 1 });
schema.index({ page: 1, pageSection: 1, position: 1 });
schema.index({ publishedAt: -1 });
schema.index({ category: 1, contentType: 1 });
schema.index({ tags: 1 });
schema.index({ language: 1 });
schema.index({ isActive: 1, isFeatured: 1 });
schema.index({ 'seo.noIndex': 1 });

// Pre-save middleware
schema.pre('save', function (next) {
	const doc = this as any;

	// Generate slug from name if not exists
	if (!doc.slug && doc.name) {
		this.slug = generateSlug(doc.name);
	}

	next();
});

// Instance Methods
schema.methods.getPublicUrl = function () {
	return `/${this.contentType}/${this.slug}`;
};

// For adding a code to the document
schema.pre<any>(
	'save',
	addSequentialCodeMiddleware({
		slug: 'content',
		prefix: 'CNT',
		initialValue: 1,
		padding: 4,
	})
);

export default mongoose.model<any>('Content', schema);
