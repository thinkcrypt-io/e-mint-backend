import mongoose from 'mongoose';
import { generateModelSettings } from './dist/lib/agent/functions/index.js';

// Connect to MongoDB (you might need to adjust the connection string)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

async function testGenerateModelSettings() {
	try {
		console.log('Connecting to MongoDB...');
		await mongoose.connect(MONGODB_URI);
		console.log('Connected to MongoDB');

		// Import the models to register them
		console.log('Importing models...');
		await import('./dist/models/user/user.model.js');

		console.log('Testing generateModelSettings with User model...');
		const result = generateModelSettings('User');

		console.log('Result:');
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error('Error:', error);
	} finally {
		await mongoose.disconnect();
		console.log('Disconnected from MongoDB');
	}
}

testGenerateModelSettings();
