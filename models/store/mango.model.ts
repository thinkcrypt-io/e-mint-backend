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
		// Home Page Models

		topBanner: {
			css: TopBannerSchema({
				bg: '#dc2e2e',
				color: '#ffffff',
				// width: 'full',
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
			heroImageMobile: String,
			heroImageMobileCss: ResponsiveImageSchema({
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
				imageMobile: String,
				imageMobileCss: ResponsiveImageSchema({
					width: {
						base: 'full',
						md: 'full',
					},
					height: {
						base: '300px',
						md: '700px',
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
				imageMobile: String,
				imageMobileCss: ResponsiveImageSchema({
					width: {
						base: 'full',
						md: 'full',
					},
					height: {
						base: '300px',
						md: '700px',
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
				imageMobile: String,
				imageMobileCss: ResponsiveImageSchema({
					width: {
						base: 'full',
						md: 'full',
					},
					height: {
						base: '300px',
						md: '700px',
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
				imageMobile: String,
				imageMobileCss: ResponsiveImageSchema({
					width: {
						base: 'full',
						md: 'full',
					},
					height: {
						base: '300px',
						md: '700px',
					},
				}),
			},
		},

		banner1: {
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
			subTitleLink: String || '/',
			image: String,
			imageCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
				height: {
					base: '300px',
					md: '700px',
				},
			}),
			imageMobile: String,
			imageMobileCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
				height: {
					base: '300px',
					md: '700px',
				},
			}),
			hide: getBoolean(false),
		},

		banner2: {
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
			subTitleLink: String || '/',
			image: String,
			imageCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
			}),
			imageMobile: String,
			imageMobileCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
				height: {
					base: '300px',
					md: '700px',
				},
			}),
			hide: getBoolean(false),
		},

		banner3: {
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
			subTitleLink: String || '/',
			image: String,
			imageCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
			}),
			imageMobile: String,
			imageMobileCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
				height: {
					base: '300px',
					md: '700px',
				},
			}),
			hide: getBoolean(false),
		},

		banner4: {
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
			subTitleLink: String || '/',
			image: String,
			imageCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
			}),
			imageMobile: String,
			imageMobileCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
				height: {
					base: '300px',
					md: '700px',
				},
			}),
			hide: getBoolean(false),
		},

		about: {
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
			image: String,
			imageCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
			}),
			button: ButtonSchema(),
			buttonLink: String || '/',
			bg: String,
			py: {
				base: Number,
				md: Number,
			},
			px: {
				base: Number,
				md: Number,
			},
			pb: {
				base: Number,
				md: Number,
			},
			hide: getBoolean(false),
		},

		aboutTwo: {
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
			image: String,
			imageCss: ResponsiveImageSchema({
				width: {
					base: 'full',
					md: 'full',
				},
				height: {
					base: 'full',
					md: 'full',
				},
			}),
			button: ButtonSchema(),
			buttonLink: String || '/',
			bg: String,
			py: {
				base: Number,
				md: Number,
			},
			px: {
				base: Number,
				md: Number,
			},
			pb: {
				base: Number,
				md: Number,
			},
			hide: getBoolean(false),
		},

		contact: {
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
			button: ButtonSchema(),
			buttonLink: String || '/',
			py: {
				base: Number,
				md: Number,
			},
			bg: String,
		},

		socialContact: {
			py: {
				base: Number,
				md: Number,
			},
			bg: String,
		},

		footer: {
			titleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			bg: String,
			gap: Number,
			py: {
				base: Number,
				md: Number,
			},
			px: {
				base: Number,
				md: Number,
			},
			link: String || '/',
		},

		bottomFooter: {
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
			bg: String,
			py: {
				base: Number,
				md: Number,
			},
			px: {
				base: Number,
				md: Number,
			},
			link: String || '/',
		},

		// Auth Page Models

		register: {
			title: getString('Enter Your Text'),
			titleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			subTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			messageTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			linkPrivacy: String || '/',
			linkTerms: String || '/',
			linkSignin: String || '/',
			button: ButtonSchema(),
		},

		login: {
			title: getString('Enter Your Text'),
			titleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			buttonSignin: ButtonSchema(),
			buttonCreateAccount: ButtonSchema(),
			subTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			linkForgetPassword: String || '/',
		},

		// Category Models

		category: {
			bg: String,
			titleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			catTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			priceTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
		},

		// Product Models

		product: {
			bg: String,
			p: {
				base: Number,
				md: Number,
			},
			titleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			catTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			priceTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			sizeLabelTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			sizeItemTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			button: ButtonSchema(),
			description: {
				headerCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				detailsCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				p: {
					base: Number,
					md: Number,
				},
				bg: String,
			},
			similar: {
				headerCss: TextSchema({
					fontSize: {
						base: 14,
						md: 16,
					},
				}),
				p: {
					base: Number,
					md: Number,
				},
				bg: String,
			},
		},

		// Cart Models

		cart: {
			bg: String,
			productTitleCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			productPriceCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			productQtyCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			productSizeCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			checkoutTitleOne: getString('Enter Your Text'),
			checkoutTitleOneCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			checkoutTitleTwo: getString('Enter Your Text'),
			checkoutTitleTwoCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			button: ButtonSchema(),
			subtotalHeaderCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			subtotalContentCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			deliveryHeaderCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			deliveryContentCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			totalHeaderCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			totalContentCss: TextSchema({
				fontSize: {
					base: 14,
					md: 16,
				},
			}),
			checkout: {
				bg: String,
				py: {
					base: Number,
					md: Number,
				},
				px: {
					base: Number,
					md: Number,
				},
			},
		},

		// Checkout Models

		checkoutCss: {
			bgColor: colors?.bg,
			fgColor: colors?.fg,
			cardBg: colors?.bg,
			cardFg: colors?.fg,
			headingSizeBase: getNumber(18),
			headingSizeBg: getNumber(24),
			headingWeight: getNumber(600),

			cardTitleSizeBase: getNumber(16),
			cardTitleSizeBg: getNumber(20),
			cardTitleWeight: getNumber(600),

			labelSize: getNumber(16),
			labelWeight: getNumber(500),

			inputBorder: colors?.fg,

			nameSizeBase: getNumber(12),
			nameSizeBg: getNumber(18),
			nameWeight: getNumber(500),
			nameColor: colors?.fg,

			qtySizeBase: getNumber(12),
			qtySizeBg: getNumber(18),
			qtyWeight: getNumber(400),
			qtyColor: colors?.fg,

			totalSizeBase: getNumber(12),
			totalSizeBg: getNumber(18),
			totalWeight: getNumber(400),
			totalColor: colors?.fg,

			summarySizeBase: getNumber(12),
			summarySizeBg: getNumber(18),
			summaryWeight: getNumber(600),
			summaryColor: colors?.fg,

			btnBg: colors?.bg,
			btnFg: colors?.fg,
			btnHoverBg: colors?.bg,
			btnHoverFg: colors?.fg,
			btnSize: getNumber(16),
			btnWeight: getNumber(500),
		},
	},
});

const Mango = mongoose.model<any>('Mango', schema);
export default Mango;
