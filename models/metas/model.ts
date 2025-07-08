import mongoose, { Schema } from 'mongoose';
import { addSequentialCodeMiddleware, generateSlug } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,
			trim: true,
		},
		// Page Reference
		page: {
			type: String,
			trim: true,
			required: true,
		},

		// Basic SEO
		title: {
			type: String,
			required: true,
			trim: true,
			maxlength: 60,
		},
		description: {
			type: String,
			required: true,
			trim: true,
			maxlength: 160,
		},
		keywords: {
			type: [String],
			maxlength: 10,
		},

		// URL
		slug: {
			type: String,

			trim: true,
		},
		canonicalUrl: {
			type: String,
			trim: true,
		},

		// Open Graph (Facebook, LinkedIn, etc.)
		ogTitle: {
			type: String,
			trim: true,
			maxlength: 60,
		},
		ogDescription: {
			type: String,
			trim: true,
			maxlength: 160,
		},
		ogImage: {
			type: String,
			trim: true,
		},
		ogType: {
			type: String,
			enum: ['website', 'article'],
			default: 'website',
		},

		// Twitter Card
		twitterTitle: {
			type: String,
			trim: true,
			maxlength: 70,
		},
		twitterDescription: {
			type: String,
			trim: true,
			maxlength: 200,
		},
		twitterImage: {
			type: String,
			trim: true,
		},
		twitterCard: {
			type: String,
			enum: ['summary', 'summary_large_image'],
			default: 'summary',
		},

		// Status
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

// Pre-save middleware
schema.pre('save', function (next) {
	const doc = this as any;

	// Generate slug if not exists
	if (!doc.slug && doc.title) {
		this.slug = generateSlug(doc.title);
	}

	// Auto-populate Open Graph fields from basic SEO if not set
	if (!doc.ogTitle && doc.title) {
		this.ogTitle = doc.title;
	}
	if (!doc.ogDescription && doc.description) {
		this.ogDescription = doc.description;
	}

	// Auto-populate Twitter fields from Open Graph if not set
	if (!doc.twitterTitle && doc.ogTitle) {
		this.twitterTitle = doc.ogTitle.substring(0, 70);
	}
	if (!doc.twitterDescription && doc.ogDescription) {
		this.twitterDescription = doc.ogDescription.substring(0, 200);
	}

	next();
});

// Method to generate all metadata for HTML head
// schema.methods.generateMetadata = function () {
// 	const metadata = {
// 		// Basic SEO meta tags
// 		metaTags: [
// 			{ name: 'title', content: this.title },
// 			{ name: 'description', content: this.description },
// 		],

// 		// Open Graph meta tags
// 		ogTags: [
// 			{ property: 'og:title', content: this.ogTitle || this.title },
// 			{ property: 'og:description', content: this.ogDescription || this.description },
// 			{ property: 'og:type', content: this.ogType },
// 		],

// 		// Twitter Card meta tags
// 		twitterTags: [
// 			{ name: 'twitter:card', content: this.twitterCard },
// 			{ name: 'twitter:title', content: this.twitterTitle || this.ogTitle || this.title },
// 			{
// 				name: 'twitter:description',
// 				content: this.twitterDescription || this.ogDescription || this.description,
// 			},
// 		],

// 		// Additional tags
// 		additionalTags: [],
// 	};

// 	// Add keywords if available
// 	if (this.keywords && this.keywords.length > 0) {
// 		metadata.metaTags.push({ name: 'keywords', content: this.keywords.join(', ') });
// 	}

// 	// Add canonical URL if available
// 	if (this.canonicalUrl) {
// 		metadata.additionalTags.push({ rel: 'canonical', href: this.canonicalUrl });
// 	}

// 	// Add Open Graph image
// 	if (this.ogImage) {
// 		metadata.ogTags.push({ property: 'og:image', content: this.ogImage });
// 	}

// 	// Add Twitter image
// 	if (this.twitterImage) {
// 		metadata.twitterTags.push({ name: 'twitter:image', content: this.twitterImage });
// 	} else if (this.ogImage) {
// 		metadata.twitterTags.push({ name: 'twitter:image', content: this.ogImage });
// 	}

// 	// Add Open Graph URL
// 	if (this.canonicalUrl) {
// 		metadata.ogTags.push({ property: 'og:url', content: this.canonicalUrl });
// 	}

// 	return metadata;
// };

// Method to generate HTML meta tags string
// schema.methods.generateMetaTagsHTML = function () {
// 	const metadata = this.generateMetadata();
// 	let html = '';

// 	// Title tag
// 	html += `<title>${this.title}</title>\n`;

// 	// Basic meta tags
// 	metadata.metaTags.forEach(tag => {
// 		html += `<meta name="${tag.name}" content="${tag.content}" />\n`;
// 	});

// 	// Open Graph tags
// 	metadata.ogTags.forEach(tag => {
// 		html += `<meta property="${tag.property}" content="${tag.content}" />\n`;
// 	});

// 	// Twitter tags
// 	metadata.twitterTags.forEach(tag => {
// 		html += `<meta name="${tag.name}" content="${tag.content}" />\n`;
// 	});

// 	// Additional tags (canonical, etc.)
// 	metadata.additionalTags.forEach(tag => {
// 		if (tag.rel) {
// 			html += `<link rel="${tag.rel}" href="${tag.href}" />\n`;
// 		}
// 	});

// 	return html;
// };

// For adding a code to the document
schema.pre<any>(
	'save',
	addSequentialCodeMiddleware({
		slug: 'meta',
		prefix: 'META',
		initialValue: 1,
		padding: 4,
	})
);

export default mongoose.model<any>('Meta', schema);
