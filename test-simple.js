// Simple test without MongoDB connection
import mongoose from 'mongoose';

// Define a simple test schema to demonstrate the function
const testSchema = new mongoose.Schema({
	name: { type: String, required: true },
	email: { type: String, required: true },
	age: { type: Number },
	isActive: { type: Boolean, default: true },
	tags: [String],
	profile: {
		bio: String,
		avatar: String,
	},
	createdAt: { type: Date, default: Date.now },
});

const TestModel = mongoose.model('TestModel', testSchema);

// Now import and test our function
import { generateModelSettings } from './lib/agent/functions/generateModelSettings.js';

console.log('Testing generateModelSettings function...');

try {
	const result = generateModelSettings('TestModel');
	console.log('Success! Generated model settings:');
	console.log(JSON.stringify(result, null, 2));
} catch (error) {
	console.error('Error testing generateModelSettings:', error.message);
	console.error('Full error:', error);
}
