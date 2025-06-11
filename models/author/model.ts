import mongoose, { Schema, Document } from 'mongoose';

const AuthorSchema = new Schema<any>(
	{
		name: {
			type: String,
			required: [true, 'Author name is required'],
			trim: true,
		},
		image: {
			type: String,
			trim: true,
		},
		bio: {
			type: String,
			trim: true,
		},
		email: {
			type: String,
			trim: true,
			lowercase: true,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('Author', AuthorSchema);
