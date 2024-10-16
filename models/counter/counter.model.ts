import mongoose, { Schema, Document } from 'mongoose';

interface ICounter extends Document {
	sequenceValue: number;
	shop: Schema.Types.ObjectId;
}

const CounterSchema: Schema = new Schema({
	sequenceValue: {
		type: Number,
		required: true,
	},
	slug: {
		type: String,
		unique: true,
		required: true,
	},
	shop: {
		type: Schema.Types.ObjectId,
		ref: 'Shop',
	},
});

const Counter = mongoose.model<ICounter>('Counter', CounterSchema);

export default Counter;
