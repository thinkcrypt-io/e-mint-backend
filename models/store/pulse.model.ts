import { Settings } from '../../imports.js';
import mongoose, { Schema } from 'mongoose';
import {
	getString,
	colors,
	getNumber,
	font,
	getBoolean,
	getImage,
} from '../../util/index.js';
import { title } from 'process';

const productListData = [
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
];

const schema = new Schema<any>(
	{
		basic: {
			name: getString('Pulse', true),
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
				children: getString('Enter your text here'),
				fontFamily: font,
				height: getNumber(50),
				fontSize: getNumber(16),
				letterSpacing: getNumber(0),
				paddingY: getNumber(8),
				paddingX: getNumber(16),
				fontWeight: getNumber(400),
				bgColor: getString('#333333'),
				fgColor: getString('#f5f5f5'),
				hide: getBoolean(true),
				textAlign: getString('center'),
			},
			header: {
				//colors
				bgColor: colors?.bg,
				fgColor: colors?.fg,
				borderColor: colors?.bg,
				borderWidth: getNumber(1),
				shadow: String,

				searchBoxBg: colors?.bg,
				searchBoxFg: colors?.fg,
				searchBoxText: getString('Search'),
				searchBoxRadius: getNumber(999),

				btnBg: colors?.fg,
				btnFg: colors?.bg,
				btnRadius: getNumber(4),
				btnText: getString('Search'),
				btnWidth: getNumber(100),
				btnHeight: getNumber(44),
				btnFontSize: getNumber(16),
				btnFontWeight: getNumber(600),
				btnHoverBg: colors?.fg,
				btnHoverFg: colors?.bg,

				iconBg: colors?.fg,
				iconFg: colors?.bg,
				iconRadius: getNumber(999),
				iconHoverBg: colors?.fg,
				iconHoverFg: colors?.bg,
				iconSize: getNumber(20),

				tagBg: colors?.fg,
				tagFg: colors?.bg,
				tagRadius: getNumber(999),

				logoText: getString(''),
				logoHeight: getNumber(50),
				logoWidth: getNumber(50),
			},
			headerCategories: {
				bgColor: colors?.bg,
				fgColor: colors?.fg,
				hoverFg: colors?.fg,
				borderBottomColor: colors?.fg,
				borderBottomWidth: getNumber(1),
				shadow: String,
				hide: getBoolean(false),

				fontSize: getNumber(16),
				fontWeight: getNumber(600),

				gap: getNumber(4),
			},
			hero: {
				images: [
					'https://images.pexels.com/photos/11396009/pexels-photo-11396009.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
					'https://images.pexels.com/photos/11297769/pexels-photo-11297769.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
					'https://images.pexels.com/photos/19599329/pexels-photo-19599329/free-photo-of-kitchen-appliances-in-a-store.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
				],
				height: getNumber(600),
				hide: getBoolean(false),
			},

			serviceContent: [
				{
					image: getImage(),
					title: getString('Enter Title'),
					description: String,
				},
			],
			serviceCSS: {
				imageHeight: getNumber(100),
				imageWidth: getNumber(100),
				imageRadius: getNumber(4),
				bgColor: colors?.bg,
				titleColor: colors?.fg,
				descriptionColor: colors?.fg,
				titleSizeBG: getNumber(20),
				titleSizeBASE: getNumber(20),
				descriptionSize: getNumber(16),
				borderRadius: getNumber(4),
				shadow: String,
				boxShadow: { type: String, default: '0 1px 1px rgba(0, 0, 0, 0.1)' },
				showDivider: getBoolean(true),
				dividerColor: colors?.fg,
				hide: getBoolean(false),
			},

			collections: {
				title: getString('Featured Categories'),
				subTitle: getString('Get Your Desired Product from Featured Category!'),
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
			collectionsCss: {
				titleFontSizeBASE: getNumber(20),
				subTitleFontSizeBASE: getNumber(16),
				titleFontSizeBG: getNumber(20),
				subTitleFontSizeBG: getNumber(16),
				titleColor: colors?.fg,
				subTitleColor: colors?.fg,
				align: getString('center'),
				titleFontWeight: getNumber(600),
				subTitleFontWeight: getNumber(400),
				bgColor: colors?.bg,
				fgColor: colors?.fg,
				borderRadius: getNumber(4),
				shadow: String,
				hoverShadow: String,
				fgColorHover: colors?.fg,
				fontSize: getNumber(16),
				fontWeight: getNumber(400),
				imageHeight: getNumber(100),
				imageWidth: getNumber(100),
				hide: getBoolean(false),
				innerGap: getNumber(4),
				outerGap: getNumber(4),
				boxShadow: { type: String, default: '0 1px 1px rgba(0, 0, 0, 0.1)' },
			},
			homeProductCss: {
				titleFontSizeBASE: getNumber(20),
				subTitleFontSizeBASE: getNumber(16),
				titleFontSizeBG: getNumber(20),
				subTitleFontSizeBG: getNumber(16),

				showBtnColor: colors?.fg,
				titleColor: colors?.fg,
				subTitleColor: colors?.fg,
				titleFontWeight: getNumber(600),
				subTitleFontWeight: getNumber(400),
				cardBg: colors?.bg,
				cardFg: colors?.fg,
				align: getString('center'),
				shadow: String,
				borderRadius: getNumber(4),
				ribbonBg: String,
				ribbonFg: String,
				cardTitleSize: getNumber(16),
				cardTitleWeight: getNumber(600),
				cardTitleTextAlign: getString('center'),
				priceTextColor: colors?.fg,
				btnBg: colors?.fg,
				btnFg: colors?.bg,
				btnHoverBg: colors?.bg,
				btnHoverFg: colors?.fg,
				btnRadius: getNumber(4),
				btnFontSize: getNumber(16),
				btnFontWeight: getNumber(600),
				btnText: getString('Add to Cart'),
				showBtn: getBoolean(true),

				bannerBg: colors?.bg,
				bannerFg: colors?.fg,

				arrowBtnBg: colors?.fg,
				arrowBtnFg: colors?.bg,

				tagBg: colors?.bg,
				tagFg: colors?.fg,
				tagRadius: getNumber(20),
				tagTextSize: getNumber(12),
			},

			faqPage: {
				image: String,
				title: getString('Enter your title here'),
				description: getString('Enter your description here'),
				textColor: colors?.bg,
			},

			sponsoredBannerOne: {
				images: [],
				hide: getBoolean(true),
				borderRadius: getNumber(4),
				grid: getNumber(4),
			},

			sponsoredBannerTwo: {
				imageOne: getImage(),
				hrefOne: String,
				hrefTwo: String,
				imageTwo: getImage(),
				borderRadius: getNumber(4),
				hide: getBoolean(false),
			},

			sponsoredBannerThree: {
				image: getImage(),
				h: getNumber(200),
				borderRadius: getNumber(4),
				href: String,
				hide: getBoolean(false),
			},

			footer: {
				bgColor: colors?.bg,
				fgColor: colors?.fg,
				hoverColor: colors?.fg,

				titleFontWeight: getNumber(600),
				titleSizeBase: getNumber(20),
				titleSizeBG: getNumber(20),

				fontSize: getNumber(16),

				borderColor: colors?.fg,

				footerTagBg: colors?.bg,
				footerTagFg: colors?.fg,
				footerTagFontSize: getNumber(16),
				hideFooterTag: getBoolean(false),

				iconBg: colors?.fg,
				iconFg: colors?.bg,
				iconRadius: getNumber(999),
				iconHoverBg: colors?.fg,
				iconHoverFg: colors?.bg,
				iconSize: getNumber(20),

				logoWidth: getNumber(80),
				logoHeight: getNumber(80),

				copyrightFontSize: getNumber(14),
				copyrightFontColor: colors?.fg,
			},

			// aboutPage: {
			// 	image: String,
			// 	title: getString('Enter your title here'),
			// 	description: getString('Enter your description here'),
			// 	textColor: colors?.fg,
			// },
			///////////////// starts
			aboutPage: {
				// image: getImage(),
				// title: getString('Enter your title here'),
				// description: getString('Enter your description here'),
				// textColor: colors?.fg,
				banner: {
					imgSrc: getImage(),
					text: {
						title: getString('Enter your title here'),
						default: String,
					},
				},
				mission: {
					label: {
						title: getString('Our Mission'),
						default: String,
					},
					paraOne: {
						title: getString(
							'A mission statement is a simple statement about the goals, values, andobjectives of an organization. A mission statement summarizes why abusiness exists and helps a company respond to change and make decisionsthat align with its vision.'
						),
						default: String,
					},
					paraTwo: {
						title: getString(
							'Our mission is simple: to offer a shopping experience that combinesquality, convenience, and value. We aim to create a platform that’s morethan a marketplace – it’s a trusted resource for discovering products you love, providing easy access to items that enhance your life'
						),
						default: String,
					},
				},
				productRange: {
					label: {
						title: getString('Wide Product Range'),
						default: String,
					},
					paraOne: {
						title: getString(
							'We believe in variety and diversity, curating a vast selection of products to cater to all kinds of preferences and needs. Whether you’re searching for the latest fashion trends, premium electronics, household essentials, or unique gifts, we have it all. Our team works diligently to expand our collection, constantly adding new and exciting products to ensure there’s something for everyone.'
						),
						default: String,
					},
					paraTwo: {
						title: getString(
							'Our mission is simple: to offer a shopping experience that combines quality, convenience, and value. We aim to create a platform that’s more than a marketplace – it’s a trusted resource for discovering products you love, providing easy access to items that enhance your life'
						),
						default: String,
					},
					customerCentric: {
						label: {
							title: getString('Customer-Centric Approach'),
							default: String,
						},
						paraOne: {
							title: getString(
								"Customer satisfaction is our top priority. We’re here to make sure that your experience on our site is smooth from start to finish. Our dedicated customer support team is always available to help with questions, order tracking, returns, and more. We listen to our customers' feedback and continuously work to improve every aspect of our service."
							),
							default: String,
						},
					},
					trustedQuality: {
						label: {
							title: getString('Trusted Quality'),
							default: String,
						},
						paraOne: {
							title: getString(
								'Quality is at the core of our brand. We carefully select each product based on rigorous standards, partnering with trusted suppliers to bring you only the best. Every item undergoes a thorough quality check, ensuring it meets our promise of excellence. This commitment to quality sets us apart and helps build trust with our valued customers.'
							),
							default: String,
						},
					},
					seamlessShopping: {
						label: {
							title: getString('Seamless Shopping Experience'),
							default: String,
						},
						paraOne: {
							title: getString(
								'Our website is designed with you in mind, featuring an intuitive interface that makes it easy to find what you need. With advanced search filters, personalized recommendations, and a streamlined checkout process, we aim to make shopping simple, fast, and enjoyable. Your safety and convenience are paramount, which is why we offer multiple payment options and robust security measures for a worry-free shopping experience.'
							),
							default: String,
						},
					},
					reliableDelivery: {
						label: {
							title: getString('Fast & Reliable Delivery'),
							default: String,
						},
						paraOne: {
							title: getString(
								'We know that timely delivery is crucial. Our logistics team works with reputable delivery partners to ensure your order reaches you safely and on time. We offer a variety of shipping options to suit your preferences, including expedited services for those last-minute needs.'
							),
							default: String,
						},
					},
					sustainablePractice: {
						label: {
							title: getString('Sustainable Practices'),
							default: String,
						},
						paraOne: {
							title: getString(
								'we’re committed to making a positive impact. We continuously strive to adopt sustainable practices in our operations, from eco-friendly packaging to responsible sourcing. By supporting sustainable products and reducing our environmental footprint, we aim to contribute to a better, greener future.'
							),
							default: String,
						},
					},
					community: {
						label: {
							title: getString('Community & Care'),
							default: String,
						},
						paraOne: {
							title: getString(
								'We believe in giving back to our community and are passionate about supporting meaningful causes. We work closely with local artisans, small businesses, and social initiatives to bring unique and impactful products to our store. Our aim is to connect customers with products they love while making a positive difference in the world.'
							),
							default: String,
						},
					},
					greetings: {
						title: getString(
							'Thank you for choosing [Your Website Name] as your trusted e-commerce platform. We’re excited to be part of your journey and look forward to serving you with dedication, passion, and excellence.'
						),
						default: String,
					},
				},
			},
			///////////////////// ends

			privaryPolicyPage: {
				image: String,
				title: getString('Enter your title here'),
				description: getString('Enter your description here'),
				textColor: colors?.bg,
			},

			contactPage: {
				image: String,
				title: getString('Enter your title here'),
				description: getString('Enter your description here'),
				textColor: colors?.fg,
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

			productPage: {
				//Add to cart button
				atcBtnFg: colors?.fg,
				atcBtnBg: colors?.bg,
				atcBtnFontSize: getNumber(16),
				atcBtnFontWeight: getNumber(500),
				atcBtnRadius: getNumber(4),
				atcBtnHoverBg: colors?.fg,
				atcBtnHoberFg: colors?.bg,

				//secondary Button
				secondaryBtnFg: colors?.fg,
				secondaryBtnBg: colors?.bg,
				secondaryBtnFontSize: getNumber(16),
				secondaryBtnFontWeight: getNumber(500),
				secondaryBtnRadius: getNumber(4),
				secondaryBtnHoverBg: colors?.fg,
				secondaryBtnHoberFg: colors?.bg,

				//title text
				titleFontSizeBg: getNumber(36),
				titleFontSizeBase: getNumber(24),
				titleFontWeight: getNumber(700),
				titleColor: colors?.fg,

				//price text
				priceFontSizeBg: getNumber(36),
				priceFontSizeBase: getNumber(24),
				priceFontWeight: getNumber(700),
				priceColor: colors?.fg,

				//tabs
				tabBg: colors?.bg,
				tabFg: colors?.fg,
				tabHoverBg: colors?.fg,
				tabHoverFg: colors?.bg,
				// tabBorderBottom: getNumber(0),
				// tabBorderBottomColor: colors?.bg,

				//text
				textPrimary: colors?.bg,
				textSecondary: colors?.bg,
				HeadingFg: colors?.bg,
				headingBg: colors?.bg,
				headingFontSize: getNumber(24),
				headingFontWeight: getNumber(700),

				//misc
				borderColor: colors?.fg,

				//badge
				badgeBg: colors?.bg,
				badgeFg: colors?.fg,
				badgeSecondaryFg: colors?.fg,
				badgeRadius: getNumber(4),
				badgeFontWeight: getNumber(500),

				// specification card
				cardBg: colors?.bg,
				cardFg: colors?.fg,
				cardTableBg: colors?.bg,
				cardTableFg: colors?.bg,

				// social share
				bgColor: colors?.bg,
				fgColor: colors?.fg,
				fontSize: getNumber(12),
				iconSize: getNumber(18),
				iconFg: colors?.fg,
				borderRadius: getNumber(40),
				boxShadow: { type: String, default: '0 1px 1px rgba(0, 0, 0, 0.1)' },
			},

			productList: productListData,
			productListTwo: productListData,
			productListThree: productListData,
			productListFour: productListData,
			productListFive: productListData,

			shoppingCartCSS: {
				headingBg: colors?.bg,
				headingFg: colors?.fg,
				headingSizeBase: getNumber(20),
				headingSizeBg: getNumber(24),
				bodyBg: colors?.bg,
				bodyFg: colors?.fg,
				titleSizeBase: getNumber(16),
				titleSizeBg: getNumber(20),
				titleWeight: getNumber(600),
				removeFg: colors?.fg,
				removeSize: getNumber(16),
				borderColor: colors?.fg,
				priceSizeBase: getNumber(16),
				priceSizeBg: getNumber(20),
				qtyBg: colors?.bg,
				qtyFg: colors?.fg,
				footerBg: colors?.bg,
				footerFg: colors?.fg,
				fTextSize: getNumber(16),
				fTextWeight: getNumber(600),
				checkoutBg: colors?.fg,
				checkoutFg: colors?.bg,
				checkoutHoverBg: colors?.bg,
				checkoutHoverFg: colors?.fg,
				checkoutTextSize: getNumber(16),
				checkoutTextWeight: getNumber(600),
			},
			authModalCss: {
				bgColor: colors?.bg,
				fgColor: colors?.fg,
				titleSizeBase: getNumber(14),
				titleSizeBg: getNumber(20),
				titleColor: colors?.fg,
				titleFontWeight: getNumber(600),
				titleAlign: getString('center'),

				secondaryTextColor: colors?.fg,
				secondaryTextSize: getNumber(12),

				labelSize: getNumber(12),
				labelWeight: getNumber(600),
				primaryBtnBg: colors?.bg,
				primaryBtnFg: colors?.fg,
				primaryBtnHoverBg: colors?.bg,
				primaryBtnHoverFg: colors?.fg,

				secondaryBtnBg: colors?.bg,
				secondaryBtnFg: colors?.fg,
				secondaryBtnHoverBg: colors?.bg,
				secondaryBtnHoverFg: colors?.fg,
				borderColor: colors?.fg,

				btnFontSize: getNumber(16),
				btnFontWeight: getNumber(600),
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

const Pulse = mongoose.model<any>('Pulse', schema);
export default Pulse;
