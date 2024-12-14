import { Settings } from '../../imports.js';
import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		basic: {
			name: { type: String, required: true, default: 'Hongo Store' },
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
			borderColor: {
				type: String,
				default: '#000',
			},
			cardBg: {
				type: String,
				default: '#fff',
			},
			btnColor: {
				type: String,
				default: '#000',
			},
			btnTextColor: {
				type: String,
				default: '#fff',
			},
			cardRadius: {
				type: Number,
				default: 4,
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
			headerBg: {
				type: String,
				default: '#fff',
			},
			headerFg: {
				type: String,
				default: '#000',
			},
			headerTagColor: {
				type: String,
				default: '#000',
			},
			headerTagTextColor: {
				type: String,
				default: '#000',
			},
			searchTextColor: {
				type: String,
				default: '#000',
			},
			searchBoxColor: {
				type: String,
				default: '#fff',
			},
			headerIconColor: {
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
				leftText: {
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

			services: [{ image: String, title: String, description: String }],

			aboutPage: {
				image: String,
				title: {
					type: String,
					default: 'Enter your title here',
				},
				description: {
					type: String,
					default: 'Enter your description here',
				},
				textColor: {
					type: String,
					default: '#fff',
				},
			},

			privaryPolicyPage: {
				image: String,
				title: {
					type: String,
					default: 'Enter your title here',
				},
				description: {
					type: String,
					default: 'Enter your description here',
				},
				textColor: {
					type: String,
					default: '#fff',
				},
			},

			faqPage: {
				image: String,
				title: {
					type: String,
					default: 'Enter your title here',
				},
				description: {
					type: String,
					default: 'Enter your description here',
				},
				textColor: {
					type: String,
					default: '#fff',
				},
			},

			header: {
				bgColor: {
					type: String,
					default: '#fff',
				},
				fgColor: {
					type: String,
					default: '#000',
				},
				borderColor: {
					type: String,
					default: '#000',
				},
				searchBoxBg: {
					type: String,
					default: '#fff',
				},
				searchBoxFg: {
					type: String,
					default: '#000',
				},
				searchBoxIcon: {
					type: String,
					default: '#000',
				},
				searchBoxText: {
					type: String,
					default: 'Search',
				},
				searchBoxTextColor: {
					type: String,
					default: '#000',
				},
				iconBg: {
					type: String,
					default: '#000',
				},
				iconFg: {
					type: String,
					default: '#fff',
				},
				tagBg: {
					type: String,
					default: '#000',
				},
				tagFg: {
					type: String,
					default: '#fff',
				},
				logo: {
					type: String,
				},
				searchBoxRadius: {
					type: Number,
					default: 999,
				},
				iconRadius: {
					type: Number,
					default: 999,
				},
			},

			contactPage: {
				image: String,
				title: {
					type: String,
					default: 'Enter your title here',
				},
				description: {
					type: String,
					default: 'Enter your description here',
				},
				textColor: {
					type: String,
					default: '#fff',
				},
			},

			hero: {
				image: String,
				title: {
					type: String,
					default: 'Your title here',
				},
				subTitle: {
					type: String,
					default: 'Your subtitle here',
				},
				btnText: {
					type: String,
					default: 'Shop Now',
				},
				href: {
					type: String,
					default: '#',
				},

				align: {
					type: String,
					enum: ['left', 'right', 'center'],
					default: 'center',
				},
				titleColor: {
					type: String,
					default: '#000',
				},
				subTitleColor: {
					type: String,
					default: '#000',
				},
				btnColor: {
					type: String,
					default: '#fff',
				},
				btnTextColor: {
					type: String,
					default: '#000',
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
