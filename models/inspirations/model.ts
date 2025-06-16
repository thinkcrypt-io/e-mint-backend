import mongoose, { Schema, Document, Types } from 'mongoose';

export type UIInspiration = any;

const UIInspirationSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		}, // Inspiration name
		description: {
			type: String,
		},
		pageName: {
			type: String,
			trim: true,
		},
		inspirationType: {
			type: String,
			enum: ['website', 'app', 'component', 'page', 'other'],
			default: 'website',
		},
		category: { type: String, trim: true },
		project: {
			type: Schema.Types.ObjectId,
			ref: 'Software',
		}, // Reference to Project
		note: {
			type: String,
			trim: true,
		}, // Optional note
		images: [{ type: String }], // Array of image URLs/paths
		tags: [
			{
				type: String,
				trim: true,
			},
		], // Tags for filtering/search
		sourceUrl: {
			type: String,
			trim: true,
		}, // Where the inspiration was found
		addedBy: {
			type: Schema.Types.ObjectId,
			ref: 'Admin',
		}, // Who added the inspiration
		status: {
			type: String,
			enum: ['active', 'archived'],
			default: 'active',
		}, // Status
	},
	{
		timestamps: true,
	}
);

const Inspiration = mongoose.model('Inspiration', UIInspirationSchema);

export default Inspiration;
