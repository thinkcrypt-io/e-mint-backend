import mongoose, { Schema } from 'mongoose';
import Counter from '../counter/counter.model.js';
import Admin from '../../library/models/admin/model.js';
import sendMail from '../../controllers/mail/sendMail.controller';

const schema = new Schema<any>(
	{
		code: {
			type: String,
			unique: true,
			trim: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
			min: 3,
			max: 50,
		},
		description: {
			type: String,
			trim: true,
		},
		client: {
			type: Schema.Types.ObjectId,
			ref: 'Client',
		},
		docUrl: {
			type: String,
			trim: true,
		},
		fileUrl: {
			type: String,
			trim: true,
		},
		category: {
			type: String,
			trim: true,
			lowercase: true,
		},
		direction: {
			type: String,
			trim: true,
			enum: ['inbound', 'outbound', 'internal', 'other'],
		},
		tags: [String],

		project: {
			type: Schema.Types.ObjectId,
			ref: 'Software',
		},
		privacy: {
			type: String,
			enum: ['public', 'private', 'only-me'],
			default: 'private',
		},
		addedBy: {
			type: Schema.Types.ObjectId,
			ref: 'Admin',
		},
		access: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Admin',
			},
		],
	},
	{ timestamps: true }
);

let isNewItem = false;

schema.pre<any>('save', function (next) {
	isNewItem = this.isNew;
	next();
});

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'document' });
			if (!counter) counter = new Counter({ sequenceValue: 40, slug: 'document' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `DOC-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Doc = mongoose.model<any>('Document', schema);
export default Doc;
