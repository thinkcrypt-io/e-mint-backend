import mongoose, { Schema } from 'mongoose';
import Counter from '../counter/counter.model.js';

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
		platform: {
			type: String,
			trim: true,
		},
		url: {
			type: String,
			trim: true,
		},
		userid: {
			type: String,
			trim: true,
		},
		category: {
			type: String,
			enum: ['password', 'api-key', 'env', 'token', 'other'],
		},
		value: {
			type: String,
			trim: true,
		},
		pass: {
			type: String,
			trim: true,
		},
		key: {
			type: String,
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		note: {
			type: String,
			trim: true,
		},
		client: {
			type: Schema.Types.ObjectId,
			ref: 'Client',
		},

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
			let counter = await Counter.findOne({ slug: 'credential' });
			if (!counter) counter = new Counter({ sequenceValue: 40, slug: 'credential' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `CRD-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Credential = mongoose.model<any>('Credential', schema);
export default Credential;
