import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt, { compare, hash } from 'bcrypt';
import settings from './settings';

export type AdminType = {
	name: string;
	username: string;
	email: string;
	phone?: string;
	isActive?: boolean;
	isDeleted?: boolean;
	password: string;
	github?: string;
	preferences?: any;
	role: Schema.Types.ObjectId;
	/** URL of this admin's own signature image, used on invoice/bill/receipt
	 *  PDFs they download with "Include signature" checked. */
	signature?: string;
	/** Desktop layout for create/edit forms: a centered dialog, or a panel
	 *  sliding in from the right. Mobile always uses the bottom sheet
	 *  regardless of this. Per-admin, set from the admin's own Settings page. */
	modalLayout?: 'modal' | 'drawer';
	generateAuthToken?: () => string;
};

const schema = new Schema<AdminType>(
	{
		name: {
			type: String,
			trim: true,
			required: [true, 'Name is required'],
		},

		username: {
			type: String,
			trim: true,
		},

		github: {
			type: String,
			trim: true,
		},

		email: {
			type: String,
			trim: true,
			required: [true, 'Email is required'],
			toLowerCase: true,
		},

		phone: { type: String, trim: true },

		signature: { type: String, trim: true },

		modalLayout: {
			type: String,
			enum: ['modal', 'drawer'],
			default: 'drawer',
		},

		role: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'AdminRole',
			required: [true, 'Role is required'],
		},

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		isDeleted: {
			type: Boolean,
			default: false,
			required: true,
		},

		password: {
			type: String,
			minlength: 8,
			maxlength: 1024,
		},
		preferences: {
			categories: [String],
			items: [String],
			users: [String],
			collections: [String],
			feedbacks: [String],
			products: [String],
			customers: [String],
			orders: [String],
			roles: [String],
			expenses: [String],
			payments: [String],
			returns: [String],
			deliveries: [String],
			ledgers: [String],
			suppliers: [String],
			shops: [String],
			sellers: [String],
			themes: [String],
			purchasedthemes: [String],
			leads: [String],
			admins: [String],
			projects: [String],
			adminroles: [String],
			clients: [String],
			permissions: [String],
			documents: [String],
			pages: [String],
			domains: [String],
			jobposts: [String],
			jobapplications: [String],
			meetings: [String],
			invoices: [String],
			folders: [String],
			socials: [String],
			leaves: [String],
			metas: [String],
			softwares: [String],
			repos: [String],
			images: [String],
			teams: [String],
			portfolios: [String],
			services: [String],
			issues: [String],
			maintenances: [String],
			resources: [String],
			components: [String],
			props: [String],
			//plans
			plannedmodels: [String],
			plannedprojects: [String],
			plannedfeatures: [String],
			plannedpages: [String],
			modelattributes: [String],
			employees: [String],

			billsubscriptions: [String],
			tcclients: [String],
			bills: [String],
			fgroups: [String],
			emails: [String],
			offers: [String],
			features: [String],
			solutions: [String],
			techstacks: [String],
			//
			views: [String],
			authors: [String],
			blogs: [String],
			clickevents: [String],
			npmlibraries: [String],
			sidebarcategories: [String],
			sidebaritems: [String],
			files: [String],
			prospects: [String],
			vacancies: [String],

			//
			hostings: [String],
			urls: [String],
			models: [String],
			tableconfigs: [String],
			fieldconfigs: [String],
			formconfigs: [String],

			credentials: [String],
			configs: [String],
			settings: [String],
		},
	},

	{
		timestamps: true,
	},
);

schema.methods.checkPassword = async function (password: string) {
	// is match comment
	const isMatch = await compare(password, this.password);
	return isMatch;
};

schema.pre<any>('save', async function (next) {
	// if the password is not modified, skip this middleware
	const salt = await bcrypt.genSalt(10);
	if (!this.isModified('password')) return next();
	// hash the password
	const hashedPassword = await hash(this.password, salt);
	this.password = hashedPassword;
	next();
});

schema.methods.generateAuthToken = function (this: any): string {
	const token = jwt.sign(
		{
			_id: this._id,
			name: this.name,
			email: this.email,
			role: this.role,
			phone: this.phone,
		},
		process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542',
	);

	return token;
};

const Admin = mongoose.model<AdminType>('Admin', schema);
// export { default as settings } from './admin.settings.js';
export default Admin;
