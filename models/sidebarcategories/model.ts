import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: [true, 'Category Name is required'],
			trim: true,
			maxlength: [200, 'Name cannot exceed 200 characters'],
		},
		description: {
			type: String,
			trim: true,
		},
		shortName: {
			type: String,
			trim: true,
			maxlength: [100, 'Short name cannot exceed 100 characters'],
		},
		priority: {
			type: Number,
			required: [true, 'Priority is required'],
			default: 1,
		},
		accessLevel: {
			type: Number,
			default: 1,
		},
		tooltip: {
			type: String,
			trim: true,
		},
		icon: {
			type: String,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		notes: {
			type: String,
			trim: true,
			maxlength: [500, 'Notes cannot exceed 500 characters'],
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('SidebarCategory', schema);
