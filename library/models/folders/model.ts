import mongoose, { Schema } from 'mongoose';
import { generateSlug } from '../_index.js';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		parent: {
			type: Schema.Types.ObjectId,
			ref: 'Folder',
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		// Organization & Display
		priority: {
			type: Number,
			default: 0,
		},
		slug: {
			type: String,
			unique: true,
			trim: true,
		},
		// Trash (media manager). `trashRoot` is the id of the item the user actually
		// trashed: that folder itself, or the ancestor folder it went to the trash with.
		// Restore and purge act on everything sharing a trashRoot.
		trashedAt: {
			type: Date,
			default: null,
		},
		trashRoot: {
			type: Schema.Types.ObjectId,
			default: null,
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

//For adding a slug to the document, comment out if not needed or the doc has no slug field
// Pre-save middleware
schema.pre('save', function (next) {
	const doc = this as any;

	if (!doc.slug && doc.name) this.slug = generateSlug(doc.name);

	next();
});

schema.index({ parent: 1, trashedAt: 1 });

export default mongoose.model<any>('Folder', schema);
