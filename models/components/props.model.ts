import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		//Name of the Component
		component: {
			type: Schema.Types.ObjectId,
			ref: 'Component',
			required: [true, 'Component is required'],
		},
		//Name of the Prop
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
		condition: {
			type: String,
			trim: true,
		},
		//Type of the Prop
		type: {
			type: String,
			required: [true, 'Type is required'],
			trim: true,
		},
		typeValue: {
			type: String,
		},
		//Required
		isRequired: {
			type: Boolean,
			default: false,
		},
		//Default value
		default: {
			type: String,
			trim: true,
		},
	},

	{
		timestamps: true,
	}
);

export const propSettings = {};

const Prop = mongoose.model<any>('Prop', schema);
export default Prop;
