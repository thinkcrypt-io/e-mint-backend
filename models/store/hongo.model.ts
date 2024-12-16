import { Settings } from '../../imports.js';
import mongoose, { Schema } from 'mongoose';
import { getString, colors, getNumber, font, getBoolean } from '../../util/index.js';

const schema = new Schema<any>(
	{
		basic: {
			name: getString('Hongo Store', true),
			logo: getString(''),
			phone: getString('+8801xxxxxxxxx'),
			email: getString('example@yourmail.com'),
			address: getString('Dhaka, Bangladesh'),
			bgColor: colors?.bg,
			borderColor: colors?.fg,
			cardBg: colors?.bg,
			btnColor: colors?.fg,
			btnTextColor: colors?.bg,
			cardRadius: getNumber(4),
			primaryFont: font,
			secondaryFont: font,
			brandColor: colors?.bg,
			brandTextColor: colors?.fg,
			primaryTextColor: colors?.bg,
			secondaryTextColor: colors?.bg,
			headerBg: colors?.fg,
			headerFg: colors?.bg,
			headerTagBg: colors?.fg,
			headerTagTextColor: colors?.fg,
			searchTextColor: colors?.fg,
			searchBoxColor: colors?.bg,
			headerIconColor: colors?.fg,
			headerBorder: colors?.bg,
			footerBg: colors?.bg,
			footerFg: colors?.fg,
			footerBannerBg: colors?.bg,
			footerBannerFg: colors?.fg,
			footerBorder: colors?.fg,
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
				leftText: getString('Left Text'),
				rightText: getString('Right Text'),
				fontFamily: font,
				height: Number,
				fontSize: getNumber(16),
				letterSpacing: getNumber(0),
				paddingY: getNumber(8),
				fontWeight: getNumber(400),
				bgColor: colors?.bg,
				fgColor: colors?.fg,
				hide: getBoolean(false),
			},

			services: [{ image: String, title: String, description: String }],
			aboutPage: {
				image: String,
				title: getString('Enter your title here'),
				description: getString('Enter your description here'),
				textColor: colors?.fg,
			},

			privaryPolicyPage: {
				image: String,
				title: getString('Enter your title here'),
				description: getString('Enter your description here'),
				textColor: colors?.bg,
			},

			faqPage: {
				image: String,
				title: getString('Enter your title here'),
				description: getString('Enter your description here'),
				textColor: colors?.bg,
			},

			header: {
				//colors
				bgColor: colors?.bg,
				fgColor: colors?.fg,
				borderColor: colors?.bg,

				searchBoxBg: colors?.bg,
				searchBoxFg: colors?.fg,
				searchBoxIcon: colors?.fg,
				searchBoxText: getString('Search'),
				searchBoxTextColor: colors?.fg,
				iconBg: colors?.fg,
				iconFg: colors?.bg,
				tagBg: colors?.fg,
				tagFg: colors?.bg,
				logo: getString(''),
				searchBoxRadius: getNumber(999),
				iconRadius: getNumber(999),
			},

			footer: {
				bgColor: colors?.bg,
				fgColor: colors?.fg,
			},

			contactPage: {
				image: String,
				title: getString('Enter your title here'),
				description: getString('Enter your description here'),
				textColor: colors?.fg,
			},

			hero: {
				image: String,

				//
				title: getString('Your Title Here'),
				titleFont: String,
				titleFontSizeSm: getNumber(40),
				titleFontSizeLg: getNumber(84),
				titleLineHeight: getNumber(4),
				titleColor: colors?.fg,
				titleLetterSpacing: getNumber(0),
				titleFontWeight: getString('600'),

				//
				subTitle: getString('Your Subtitle Here'),
				subTitleFont: String,
				subTitleFontSizeSm: getNumber(16),
				subTitleFontSizeLg: getNumber(16),
				subTitleColor: colors?.fg,
				subTitleLineHeight: getNumber(1),
				subTitleLetterSpacing: getNumber(1),
				subTitleFontWeight: getString('400'),

				//
				btnText: getString('Shop Now'),
				href: getString('#'),
				btnHeight: getNumber(44),
				btnWidth: getNumber(100),
				btnColor: colors?.bg,
				btnTextColor: colors?.fg,
				btnRadius: getNumber(0),
				btnBorderColor: colors?.bg,
				btnFontSize: getNumber(16),

				//btn hover
				btnHoverColor: colors?.fg,
				btnHoverTextColor: colors?.bg,
				btnHoverBorderColor: colors?.fg,

				align: {
					type: String,
					enum: ['left', 'right', 'center'],
					default: 'center',
				},
			},
			featuredCollection: [
				{
					title: String,
					subTitle: String,
					image: String,
					priority: {
						type: Number,
						default: 0,
					},
				},
			],

			collections: {
				title: getString('Collections'),
				borderRadius: getNumber(4),
				subTitle: getString('Discover our collection'),
				btnText: getString('View All'),
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

const Hongo = mongoose.model<any>('Hongo', schema);
export default Hongo;
