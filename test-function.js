import mongoose from 'mongoose';
import { generateModelSettings } from './dist/lib/agent/functions/generateModelSettings.js';

// Define a simple test schema to demonstrate the function
const testSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
		trim: true,
	},
	email: {
		type: String,
		required: true,
		unique: true,
		lowercase: true,
	},
	age: {
		type: Number,
		min: 0,
		max: 120,
	},
	isActive: {
		type: Boolean,
		default: true,
	},
	status: {
		type: String,
		enum: ['active', 'inactive', 'pending'],
		default: 'pending',
	},
	tags: [String],
	profile: {
		bio: String,
		avatar: String,
		preferences: {
			theme: {
				type: String,
				enum: ['light', 'dark'],
				default: 'light',
			},
		},
	},
	author: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
});

const TestModel = mongoose.model('TestModel', testSchema);

console.log('Testing generateModelSettings function...');
console.log('===================================');

try {
	const result = generateModelSettings('TestModel');

	if (result.success) {
		console.log('✅ SUCCESS! Generated model settings for TestModel');
		console.log('\n📊 Model Analysis Results:');
		console.log(`- Model Name: ${result.data.modelName}`);
		console.log(`- Total Fields: ${Object.keys(result.data.settings).length}`);
		console.log(`- Message: ${result.message}`);

		console.log('\n🔧 Generated Settings:');
		console.log(JSON.stringify(result.data.settings, null, 2));

		// Test with specific field details
		console.log('\n📋 Field Type Analysis:');
		Object.entries(result.data.settings).forEach(([fieldName, config]) => {
			console.log(
				`- ${fieldName}: ${config.type} ${config.required ? '(required)' : '(optional)'}`
			);
		});
	} else {
		console.log('❌ FAILED to generate model settings');
		console.log(`Error: ${result.message}`);
		if (result.error) {
			console.log(`Details: ${result.error}`);
		}
	}
} catch (error) {
	console.error('💥 EXCEPTION occurred while testing generateModelSettings:');
	console.error(`Error: ${error.message}`);
	console.error('Stack trace:', error.stack);
}

console.log('\n===================================');
console.log('Test completed');
