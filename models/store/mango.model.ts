import {
	colors,
	FlexSchema,
	font,
	getBoolean,
	getNumber,
	getString,
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
				}
			})
		}
	},
});

const Mango = mongoose.model<any>('Mango', schema);
export default Mango;