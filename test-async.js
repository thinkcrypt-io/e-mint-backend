import mongoose from 'mongoose';

console.log('Starting test...');

// Define a simple test schema
const testSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
	},
	email: {
		type: String,
		required: true,
	},
	age: Number,
	isActive: {
		type: Boolean,
		default: true,
	},
});

console.log('Schema defined, creating model...');
const TestModel = mongoose.model('TestModel', testSchema);
console.log('Model created successfully');

// Import the function
console.log('Importing generateModelSettings...');
import('./dist/lib/agent/functions/generateModelSettings.js')
	.then(({ generateModelSettings }) => {
		console.log('Function imported successfully');
		console.log('Testing generateModelSettings...');

		const result = generateModelSettings('TestModel');

		console.log('Function executed, result:');
		console.log(JSON.stringify(result, null, 2));
	})
	.catch(error => {
		console.error('Error importing or running function:', error);
	});
