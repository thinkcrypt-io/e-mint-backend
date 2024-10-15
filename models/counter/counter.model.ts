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
	shop: {
		type: Schema.Types.ObjectId,
		ref: 'Shop',
		required: true,
	},
});

const Counter = mongoose.model<ICounter>('Counter', CounterSchema);

export default Counter;
