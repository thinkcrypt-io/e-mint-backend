import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import CustomerType from './customer.types.js';
import { compare, hash } from 'bcrypt';

const schema = new Schema<CustomerType>(
	{
		name: {
			type: String,
			trim: true,
			required: [true, 'Name is required'],
		},

		email: {
			type: String,
			trim: true,
			required: [true, 'Email is required'],
			toLowerCase: true,
		},
		phone: { type: String, trim: true },
		group: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Group',
			},
		],

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			// required: true,
		},

		isDeleted: {
			type: Boolean,
			default: false,
		},

		isSubscribedToEmail: {
			type: Boolean,
			default: true,
			required: true,
		},

		isSubscribedToTextMessages: {
			type: Boolean,
			default: true,
			required: true,
		},

		isRegisteredOnline: {
			type: Boolean,
			default: false,
			required: true,
		},

		tags: [String],
		notes: {
			type: [String],
			trim: true,
		},

		password: {
			type: String,
			required: function () {
				return this.isRegisteredOnline;
			},
			minlength: 8,
			maxlength: 1024,
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

schema.methods.generateAuthToken = function (this: CustomerType): string {
	const token = jwt.sign(
		{
			_id: this._id,
			name: this.name,
			email: this.email,
			phone: this.phone,
		},
		process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542'
	);

	return token;
};

schema.pre<CustomerType>('save', async function (next) {
	// if the password is not modified, skip this middleware
	if (!this.isModified('password')) return next();
	// hash the password
	const hashedPassword = await hash(this.password, 10);
	this.password = hashedPassword;
	next();
});

const Customer = mongoose.model<any>('Customer', schema);
export default Customer;

export { default as settings } from './customer.settings.js';
