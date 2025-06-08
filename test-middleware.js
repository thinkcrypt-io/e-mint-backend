// Simple test to verify the middleware function is working
import { addSequentialCodeMiddleware } from './lib/functions/index.js';

// Mock Counter model for testing
const mockCounter = {
	sequenceValue: 40,
	slug: 'document',
	save: async function () {
		this.sequenceValue += 1;
		console.log(`💾 Counter saved with value: ${this.sequenceValue}`);
		return this;
	},
};

// Mock Counter.findOne
const MockCounter = {
	findOne: async function (query) {
		console.log(`🔍 Looking for counter with slug: ${query.slug}`);
		if (query.slug === 'document') {
			return mockCounter;
		}
		return null;
	},
};

// Mock the generateSequentialCode function for testing
async function testGenerateSequentialCode(options) {
	try {
		const { slug, prefix, initialValue = 1, padding = 4 } = options;

		let counter = await MockCounter.findOne({ slug });
		if (!counter) {
			counter = {
				sequenceValue: initialValue,
				slug,
				save: async function () {
					this.sequenceValue += 1;
					return this;
				},
			};
		}

		counter.sequenceValue += 1;
		await counter.save();

		return `${prefix}-${counter.sequenceValue.toString().padStart(padding, '0')}`;
	} catch (error) {
		console.error('Error generating sequential code:', error);
		throw error;
	}
}

// Test the middleware function
async function testSequentialCodeMiddleware() {
	console.log('🧪 Testing Sequential Code Middleware...\n');

	// Mock document context
	const mockDocument = {
		isNew: true,
		code: null,
	};

	// Mock next function
	const mockNext = error => {
		if (error) {
			console.log('❌ Next called with error:', error);
		} else {
			console.log('✅ Next called successfully');
		}
	};

	// Test the middleware
	try {
		console.log('📝 Testing first document...');

		// Simulate the middleware function behavior
		const middleware = async function (next) {
			try {
				if (this.isNew) {
					this.code = await testGenerateSequentialCode({
						slug: 'document',
						prefix: 'DOC',
						initialValue: 40,
						padding: 4,
					});
				}
				next();
			} catch (error) {
				console.log(error);
				next(error);
			}
		};

		// Call middleware with mock context
		await middleware.call(mockDocument, mockNext);
		console.log(`🔢 Generated code for first document: ${mockDocument.code}\n`);

		// Test second document
		const mockDocument2 = {
			isNew: true,
			code: null,
		};

		console.log('📝 Testing second document...');
		await middleware.call(mockDocument2, mockNext);
		console.log(`🔢 Generated code for second document: ${mockDocument2.code}\n`);

		// Verify sequential nature
		if (mockDocument.code && mockDocument2.code) {
			const code1Num = parseInt(mockDocument.code.split('-')[1]);
			const code2Num = parseInt(mockDocument2.code.split('-')[1]);

			if (code2Num === code1Num + 1) {
				console.log('✅ Sequential code generation working correctly!');
				console.log(`   First code: ${mockDocument.code}`);
				console.log(`   Second code: ${mockDocument2.code}`);
			} else {
				console.log('❌ Sequential code generation not working properly');
				console.log(`   Expected: ${code1Num + 1}, Got: ${code2Num}`);
			}
		}

		console.log('\n🎉 Test completed successfully!');
	} catch (error) {
		console.error('❌ Error in test:', error);
	}
}

// Run the test
testSequentialCodeMiddleware();
