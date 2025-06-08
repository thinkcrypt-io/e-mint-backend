// Test case-insensitive code search functionality
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/e-mint');

// Import the Blog model
const Blog = require('./models/blog/model.js').default;

async function testCaseInsensitiveCodeSearch() {
	try {
		console.log('Testing case-insensitive code search...');

		// First, let's see if we have any blogs with codes
		const blogsWithCodes = await Blog.find({ code: { $exists: true, $ne: null } }).limit(5);
		console.log(
			'Found blogs with codes:',
			blogsWithCodes.map(b => ({ name: b.name, code: b.code }))
		);

		if (blogsWithCodes.length === 0) {
			console.log('No blogs with codes found. Creating a test blog...');

			const testBlog = new Blog({
				name: 'Test Blog for Case Insensitive Search',
				description: 'This is a test blog',
			});

			await testBlog.save();
			console.log('Created test blog with code:', testBlog.code);

			// Test with the newly created code
			if (testBlog.code) {
				await testCodeSearch(testBlog.code);
			}
		} else {
			// Test with existing codes
			const testCode = blogsWithCodes[0].code;
			await testCodeSearch(testCode);
		}
	} catch (error) {
		console.error('Error in test:', error);
	} finally {
		mongoose.connection.close();
	}
}

async function testCodeSearch(originalCode) {
	console.log(`\nTesting with original code: "${originalCode}"`);

	const testCases = [
		originalCode, // Original case
		originalCode.toUpperCase(), // All uppercase
		originalCode.toLowerCase(), // All lowercase
		toggleCase(originalCode), // Mixed case
	];

	for (const testCode of testCases) {
		console.log(`\nSearching for code: "${testCode}"`);

		// Simulate the controller's search logic - convert to uppercase for search
		const searchCode = testCode.trim().toUpperCase();
		const query = { code: searchCode };
		const result = await Blog.findOne(query);

		if (result) {
			console.log(`✅ Found: ${result.name} (code: ${result.code})`);
		} else {
			console.log(`❌ Not found`);
		}
	}
}

function toggleCase(str) {
	return str
		.split('')
		.map(char => {
			return char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
		})
		.join('');
}

// Run the test
testCaseInsensitiveCodeSearch();
