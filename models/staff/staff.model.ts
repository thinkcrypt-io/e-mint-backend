import mongoose, { Schema } from 'mongoose';
import Type from './staff.types.js';
import bcrypt, { compare, hash } from 'bcrypt';
import jwt from 'jsonwebtoken';

const schema = new Schema<Type>(
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

		phone: { type: String, trim: true, required: [true, 'Phone is required'] },
		role: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Role',
		},
		location: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Location',
			required: [true, 'Location is required'],
		},

		isActive: { type: Boolean, required: true, default: true },
		isDeleted: { type: Boolean, required: true, default: true },
		permissions: [String],
		password: {
			type: String,
			minlength: 8,
			maxlength: 1024,
			required: [true, 'Password is required'],
		},

		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},

		lastActivity: {
			type: Date,
			default: Date.now,
		},
		lastActivityIp: {
			type: String,
		},
		lastLoginTime: {
			type: Date,
			default: Date.now,
		},
		lastLoginIp: {
			type: String,
		},
		devices: [
			{
				deviceId: String,
				deviceType: String,
				lastUsed: { type: Date, default: Date.now },
			},
		],
	},

	{
		timestamps: true,
		toJSON: { virtuals: true }, // Include this line to ensure virtuals are included when converting to JSON
		toObject: { virtuals: true }, // Include this line to ensure virtuals are included when converting to objects
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
			phone: this.phone,
			shop: this.shop,
			location: this.location,
		},
		process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542'
	);

	return token;
};

const Staff = mongoose.model<Type>('Staff', schema);
export default Staff;
