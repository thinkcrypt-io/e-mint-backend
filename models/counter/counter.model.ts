import mongoose, { Schema, Document } from 'mongoose';

interface ICounter extends Document {
	sequenceValue: number;
}

const CounterSchema: Schema = new Schema({
	sequenceValue: {
		type: Number,
		required: true,
	},
});

const Counter = mongoose.model<ICounter>('Counter', CounterSchema);

export default Counter;
