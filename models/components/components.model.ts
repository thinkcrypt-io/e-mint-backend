import mongoose, { Schema } from 'mongoose';
import Counter from '../counter/counter.model.js';

const schema = new Schema<any>(
	{
		//Component Code
		code: {
			type: String,
			trim: true,
		},
		//Name of the Component
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
		},
		//Description of the Component
		description: {
			type: String,
			trim: true,
		},
		//Version
		version: {
			type: String,
			default: '1.0.0',
		},
		//Platform of the Component (frontend, backend, other)
		platform: {
			type: String,
			required: true,
			trim: true,
			enum: ['frontend', 'backend', 'other'],
		},

		imports: [String],
	},

	{
		timestamps: true,
	}
);

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'component' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'component' });

			counter.sequenceValue += 1;
			await counter.save();

			const prefix =
				this.platform === 'frontend' ? 'FE' : this.platform === 'backend' ? 'BE' : 'OTH';

			this.code = `${prefix}-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Component = mongoose.model<any>('Component', schema);
export default Component;

export const componentSettings = {};
