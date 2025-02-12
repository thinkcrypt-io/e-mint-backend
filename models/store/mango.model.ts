import {
	ButtonSchema,
	colors,
	FlexSchema,
	font,
	getBoolean,
	getNumber,
	getString,
	ResponsiveImageSchema,
	TextSchema,
	TopBannerSchema,
} from '../../util/index.js';
import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>({
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
	basic: {
		name: getString('Mango', true),
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
		paddingXBase: getNumber(16),
		paddingXBG: getNumber(128),
		maxWidth: getNumber(1200),
		breadCrumbCss: {
			fgColor: colors?.fg,
			bgColor: colors?.bg,
			hoverColor: colors?.fg,
			fontSize: getNumber(16),
			fontWeight: getNumber(700),
		},
	},
	content: {
		topBanner: {
			css: TopBannerSchema({
				bg: '#dc2e2e',
				color: '#ffffff',
				width: 'full',
			}),
			content: getString('Enter Your Text'),
			contentCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
				textAlign: 'center',
			}),
		},

		navbar: {
			css: FlexSchema({
				bg: '#ffffff',
				color: '#000000',
				width: {
					base: 'full',
					md: 'full',
				},
				height: {
					base: '40px',
					md: '40px',
				},
				gap: {
					base: 2,
					md: 2,
				},
				justifyContent: {
					base: 'space-between',
					md: 'space-between',
				},
				alignItems: {
					base: 'center',
					md: 'center',
				},
				paddingX: {
					base: 4,
					md: 8,
				},
			}),
			navItems: [
				{
					id: {
						type: mongoose.Schema.Types.ObjectId,
						required: true,
					},
					type: {
						type: String,
						enum: ['categories'],
						required: true,
					},
				},
			],
			navItemsCss: TextSchema({
				fontSize: {
					base: 16,
					md: 16,
				},
				fontFamily: '',
			}),
			navLogo: String,
			logoCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
			}),
		},

		hero: {
			title: getString('Enter Your Text'),
			titleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			subTitle: getString('Enter Your Text'),
			subTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			heroSubTitleLink: String || '/',
			heroImage: String,
			heroImageCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
			}),
		},

		cat: {
			cat1: {
				title: getString('Enter Your Text'),
				titleCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				subTitle: getString('Enter Your Text'),
				subTitleCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				subtitleLink: String || '/',
				image: String,
				imageCss: ResponsiveImageSchema({
					width: {
						base: 'full',
						md: 'full',
					},
				}),
			},
			cat2: {
				title: getString('Enter Your Text'),
				titleCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				subTitle: getString('Enter Your Text'),
				subTitleCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				subtitleLink: String || '/',
				image: String,
				imageCss: ResponsiveImageSchema({
					width: {
						base: 'full',
						md: 'full',
					},
				}),
			},
			cat3: {
				title: getString('Enter Your Text'),
				titleCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				subTitle: getString('Enter Your Text'),
				subTitleCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				subtitleLink: String || '/',
				image: String,
				imageCss: ResponsiveImageSchema({
					width: {
						base: 'full',
						md: 'full',
					},
				}),
			},
			cat4: {
				title: getString('Enter Your Text'),
				titleCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				subTitle: getString('Enter Your Text'),
				subTitleCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				subtitleLink: String || '/',
				image: String,
				imageCss: ResponsiveImageSchema({
					width: {
						base: 'full',
						md: 'full',
					},
				}),
			},
		},
	},
});

const Mango = mongoose.model<any>('Mango', schema);
export default Mango;
