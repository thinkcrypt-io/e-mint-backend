import { Settings } from '../../imports.js';
import mongoose, { Schema } from 'mongoose';
import { getString, colors, getNumber, h1, TextSchema, ButtonSchema } from '../../util/index.js';

const schema = new Schema<any>(
	{
		basic: {
			name: { type: String, required: true, default: 'Mint Store' },
			logo: {
				type: String,
			},
			phone: {
				type: String,
				default: '+880 1828 398 225',
			},
			email: {
				type: String,
				default: 'asifistiaque.ai@gmail.com',
			},
			bgColor: {
				type: String,
				default: '#fff',
			},
			primaryFont: {
				type: String,
				default: 'Roboto',
			},
			secondaryFont: {
				type: String,
				default: 'Roboto',
			},
			brandColor: {
				type: String,
				default: '#202020',
			},
			brandTextColor: {
				type: String,
				default: '#fff',
			},
			primaryTextColor: {
				type: String,
				default: '#000',
			},
			secondaryTextColor: {
				type: String,
				default: '#666',
			},

			logoWidthSm: getNumber(160),
			logoWidthLg: getNumber(160),
			headerBg: {
				type: String,
				default: '#fff',
			},
			headerFg: {
				type: String,
				default: '#000',
			},
			headerBorder: String,
			footerBg: String,
			footerFg: String,
			footerBannerBg: String,
			footerBannerFg: String,
			footerBorder: String,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},

		socials: {
			facebook: String,
			twitter: String,
			instagram: String,
			linkedin: String,
			pinterest: String,
			youtube: String,
		},
		content: {
			banner: {
				centerText: {
					type: String,
					default: '',
				},
				rightText: {
					type: String,
					default: '',
				},
				bgColor: String,
				fgColor: String,

				hide: {
					type: Boolean,
					default: false,
				},
			},

			hero: {
				image: String,

				subTitle: String,
				btnText: String,
				href: String,

				bgColor: colors?.bg,
				opacity: getNumber(0),
				heading: h1,
				headingContent: getString('Enter Title Here'),
				headingCss: TextSchema({
					fontSize: {
						base: 40,
						md: 84,
					},
					fontWeight: '600',
				}),
				subHeadingContent: getString('Enter Subtitle Here'),
				subHeadingCss: TextSchema({
					fontSize: {
						base: 18,
						md: 22,
					},
					fontWeight: '400',
				}),
				title: getString('Enter your title here'),
				titleFontSizeSm: getNumber(40),
				titleFontSizeLg: getNumber(84),
				titleFontWeight: getString('600'),
				titleLetterSpacing: getNumber(0),
				titleFont: String,
				titleLineHeight: getNumber(1.2),
				button: ButtonSchema(),

				titleFontStyle: {
					type: String,
					enum: ['normal', 'italic', 'oblique'],
					default: 'normal',
				},

				titleColor: {
					type: String,
					default: '#000',
				},

				padding: {
					type: String,
					default: 'apply',
					enum: ['apply', 'none'],
					required: true,
				},
				align: {
					type: String,
					enum: ['left', 'right', 'center'],
					default: 'left',
				},

				subTitleColor: {
					type: String,
					default: '#000',
				},
			},
			featuredCollection: {
				type: [
					{
						title: String,
						subTitle: String,
						image: {
							type: String,
							default:
								'https://img.freepik.com/free-vector/illustration-gallery-icon_53876-27002.jpg?size=626&ext=jpg&ga=GA1.1.1412446893.1704931200&semt=ais',
						},
						href: {
							type: String,
							default: '#',
						},
						type: {
							type: String,
							enum: ['category', 'collection', 'product', 'page', 'external'],
							default: 'page',
						},
						priority: {
							type: Number,
							default: 0,
						},
					},
				],
				default: function () {
					return [
						{
							id: new mongoose.Types.ObjectId(),
							type: 'category',
						},
						{
							id: new mongoose.Types.ObjectId(),
							type: 'page',
						},
						{
							id: new mongoose.Types.ObjectId(),
							type: 'page',
						},
					];
				},
			},
			collections: {
				title: {
					type: String,
					default: 'Collections',
				},
				subTitle: {
					type: String,
					default: 'Discover our collection',
				},
				btnText: {
					type: String,
					default: 'View All',
				},
				items: [
					{
						id: {
							type: mongoose.Schema.Types.ObjectId,
							required: true,
						},

						type: {
							type: String,
							enum: ['categories', 'collections'],
							required: true,
						},
					},
				],
			},
			productList: [
				{
					id: {
						type: mongoose.Schema.Types.ObjectId,
						required: true,
					},
					title: String,
					subTitle: String,
					priority: {
						type: Number,
						default: 0,
					},
					type: {
						type: String,
						default: 'category',
						enum: ['category', 'collection'],
						required: true,
					},
				},
			],
			discover: {
				title: getString('Lorem ipsum dolor sit amet, consectetur adipiscing elit'),
				subTitle: getString(
					'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
				),
				items: {
					type: [
						{
							btnText: {
								type: String,
								default: 'Button',
							},
							image: {
								type: String,
								default:
									'https://img.freepik.com/free-vector/illustration-gallery-icon_53876-27002.jpg?size=626&ext=jpg&ga=GA1.1.1412446893.1704931200&semt=ais',
							},
							href: {
								type: String,
								default: '/',
							},
							type: {
								type: String,
								enum: ['category', 'collection', 'product', 'page', 'external'],
								default: 'page',
							},
						},
					],
					default: function () {
						return [
							{
								id: new mongoose.Types.ObjectId(),
								type: 'category',
							},
							{
								id: new mongoose.Types.ObjectId(),
								type: 'collection',
							},
						];
					},
				},
			},
			about: {
				title: {
					type: String,
					default: '',
				},
				subTitle: {
					type: String,
					default: '',
				},
				image: String,
				btnText: {
					type: String,
					default: 'Read More',
				},
			},
		},
		isActive: { type: Boolean, required: true, default: true },
	},

	{
		timestamps: true,
		toJSON: { virtuals: true }, // Include this line to ensure virtuals are included when converting to JSON
		toObject: { virtuals: true }, // Include this line to ensure virtuals are included when converting to objects
	}
);

export const contentSettings: Settings = {
	basic: {
		type: 'array-object',
		title: 'Basic',
		edit: true,
	},

	content: {
		type: 'array-object',
		title: 'Content',
		edit: true,
	},
	isActive: {
		type: 'boolean',
		title: 'Is Active',
		edit: true,
	},
	shop: {
		type: 'string',
		title: 'Shop',
		edit: true,
	},
	socials: {
		type: 'object',
		title: 'Socials',
		edit: true,
	},
};

const Store = mongoose.model<any>('Store', schema);
export default Store;
