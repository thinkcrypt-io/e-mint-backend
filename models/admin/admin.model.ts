import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt, { compare, hash } from 'bcrypt';
import { admin } from '../../middleware';

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
			documents: [String],
			jobposts: [String],
			jobapplications: [String],
			meetings: [String],
			invoices: [String],
			leaves: [String],
		},
	},

	{
		timestamps: true,
	}
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
		process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542'
	);

	return token;
};

const Admin = mongoose.model<AdminType>('Admin', schema);
// export { default as settings } from './admin.settings.js';
export default Admin;
