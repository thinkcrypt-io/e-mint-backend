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
	resetPasswordToken?: string;
	resetPasswordExpires?: Date;
	/** Lifecycle of an admin created via the invite flow: 'pending' until the
	 *  invitee accepts, 'cancelled' if the invite is withdrawn while still
	 *  pending, 'accepted' once they've set their own name/phone/password. */
	invitationStatus?: 'pending' | 'accepted' | 'cancelled';
	invitationToken?: string;
	invitationExpires?: Date;
	generateAuthToken?: () => string;
};

const schema = new Schema<AdminType>(
	{
		name: {
			type: String,
			trim: true,
			// Optional for a pending or cancelled invite (the invitee may never
			// have chosen a name) — required once accepted, and for every admin
			// created the old direct way (invitationStatus left at its
			// 'accepted' default).
			required: [
				function (this: any) {
					return this.invitationStatus === 'accepted';
				},
				'Name is required',
			],
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
			// Never returned by a query, a populate or a list — login asks for it
			// explicitly with .select('+password').
			select: false,
		},

		resetPasswordToken: { type: String, select: false },
		resetPasswordExpires: { type: Date, select: false },

		invitationStatus: {
			type: String,
			enum: ['pending', 'accepted', 'cancelled'],
			default: 'accepted',
		},
		invitationToken: { type: String, select: false },
		invitationExpires: { type: Date, select: false },

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
			filterconfigs: [String],
			fieldconfigs: [String],
			formconfigs: [String],

			credentials: [String],
			configs: [String],
			settings: [String],
			setting: [String],

			servicecategories: [String],
			contents: [String],
			paymentmethods: [String],
			history: [String],
			formfields: [String],
			herokus: [String],
			vercels: [String],
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
	// A pending invite is created with no password at all — nothing to hash
	// yet (the invitee sets one on accept, which re-triggers this hook).
	if (!this.isModified('password') || !this.password) return next();
	const salt = await bcrypt.genSalt(10);
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
