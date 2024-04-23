import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import { required } from 'joi';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			trim: true,
			required: [true, 'Name is required'],
		},

		employeeId: {
			type: String,
			trim: true,
			unique: true,
		},

		email: {
			type: String,
			trim: true,
			required: [true, 'Email is required'],
			unique: true,
			toLowerCase: true,
		},

		phone: { type: String, trim: true },

		role: {
			type: String,
			required: [true, 'Role is required'],
		},

		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},

		tags: [String],
		note: {
			type: String,
			trim: true,
		},

		password: {
			type: String,
			minlength: 8,
			maxlength: 1024,
		},
		preferences: {
			employees: [String],
			attendances: [String],
			code: [String],
		},
	},

	{
		timestamps: true,
	}
);

schema.methods.generateAuthToken = function (this: any): string {
	const token = jwt.sign(
		{
			_id: this._id,
			name: this.name,
			email: this.email,
			role: this.role,
			phone: this.phone,
			store: this.store,
		},
		process.env.JWT_PRIVATE_KEY || 'fallback_key_12345_924542'
	);

	return token;
};

const User = mongoose.model<any>('User', schema);
export { default as settings } from './user.settings.js';
export default User;
