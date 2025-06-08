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

// Add indexes for performance
AuthorSchema.index({ name: 1 });
AuthorSchema.index({ email: 1 });
AuthorSchema.index({ createdAt: -1 });

// Add text search index
AuthorSchema.index({
	name: 'text',
	bio: 'text',
});

export default mongoose.model<any>('Author', AuthorSchema);
