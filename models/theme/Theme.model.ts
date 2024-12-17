import { SettingsType } from '../../lib/types/settings.types.js';
import mongoose, { Schema } from 'mongoose';
// import { CategoryType } from './category.type.js';

type ModelType = {
	image: string; // URL to the image of the theme
	name: string; // Name of the theme
	price: number; // Price of the theme
	isFree: boolean; // Whether the theme is free or not
	developer: string; // Name of the developer
	demoUrl: string; // URL to the demo of the theme
	framework: string; // Framework of the theme
	shortDescription: string; // Short description of the theme
	description: string; // Description of the theme
	isDiscounted?: boolean; // Whether the theme is discounted or not
	discountedPrice?: number; // Discounted price of the theme
	demoVariants?: object; // Variants of the demo
	title?: string; // Title of the theme if the title is different from name
	useCase?: string; // Use case of the theme
	css?: string; // CSS framework used for the theme
	views?: number; // Number of views of the theme
	likes?: number; // Number of likes of the theme
	downloads?: number; // Number of downloads of the theme
	slug?: string; // Slug of the theme
	images?: string[]; // Array of URLs to the images of the theme
	sections?: { image?: string; title?: string; description?: string }[]; // Sections of the theme
};

const schema = new Schema<ModelType>(
	{
		image: {
			type: String,
			required: true,
		},
		images: [String],
		sections: [{ image: String, title: String, description: String }],
		name: {
			type: String,
			required: true,
		},
		slug: String,
		title: {
			type: String,
		},
		price: {
			type: Number,
			required: true,
		},
		isFree: {
			type: Boolean,
			required: true,
			default: false,
		},
		isDiscounted: Boolean,
		discountedPrice: Number,
		developer: {
			type: String,
		},
		demoUrl: {
			type: String,
			required: true,
		},
		demoVariants: Object,
		framework: {
			type: String,
		},
		description: {
			type: String,
		},
		useCase: String,
		css: String,
		views: Number,
		likes: Number,
		downloads: Number,
	},

	{
		timestamps: true,
	}
);

// Pre-save middleware to set the slug field
schema.pre('save', function (next) {
	if (!this.slug) {
		this.slug = this.name.toLowerCase().replace(/\s+/g, '-');
	}
	next();
});

export type ThemeType = ModelType;

const Theme = mongoose.model<ModelType>('Theme', schema);
export default Theme;

export const themeSettings: SettingsType<ModelType> = {
	name: {
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		trim: true,
		edit: true,
	},
	sections: {
		type: 'array-object',
		title: 'Sections',
		edit: true,
	},
	slug: {
		search: true,
		title: 'Slug',
		type: 'string',
		trim: true,
	},
	title: {
		title: 'Title',
		type: 'string',
	},
	image: {
		title: 'Image',
		type: 'uri',
		required: true,
		edit: true,
	},
	images: {
		type: 'array-string',
		title: 'Images',
		edit: true,
	},
	framework: {
		title: 'Framework',
		type: 'string',
	},
	shortDescription: {
		title: 'Short Description',
		type: 'string',
		edit: true,
	},
	description: {
		title: 'Description',
		type: 'string',
		edit: true,
	},
	price: {
		title: 'Price',
		type: 'number',
		required: true,
		edit: true,
	},
	isDiscounted: {
		title: 'Is Discounted',
		type: 'boolean',
		edit: true,
	},
	discountedPrice: {
		title: 'Discounted Price',
		type: 'number',
		edit: true,
	},
	developer: {
		title: 'Developer',
		type: 'string',
		edit: true,
	},
	demoUrl: {
		title: 'Demo URL',
		type: 'uri',
		edit: true,
	},
	demoVariants: {
		title: 'Demo Variants',
		type: 'array-object',
		edit: true,
	},
	useCase: {
		title: 'Use Case',
		type: 'string',
		edit: true,
	},
	css: {
		title: 'CSS',
		type: 'string',
		edit: true,
	},
	isFree: {
		title: 'Is Free',
		type: 'boolean',
		edit: true,
	},
};
