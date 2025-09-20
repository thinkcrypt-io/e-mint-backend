import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: [true, 'Item Name is required'],
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		href: {
			type: String,
			required: [true, 'Route is required'],
			trim: true,
		},
		icon: {
			type: String,
			trim: true,
		},
		iconDark: {
			type: String,
			trim: true,
		},
		category: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'SidebarCategory',
			required: [true, 'Category is required'],
		},
		tooltip: {
			type: String,
			trim: true,
			maxlength: [200, 'Tooltip cannot exceed 200 characters'],
		},
		priority: {
			type: Number,
			required: [true, 'Priority is required'],
			default: 1,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		permissionProtected: {
			type: Boolean,
			default: false,
		},
		permission: {
			type: String,
			required: true,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

export default mongoose.model<any>('SidebarItem', schema);
