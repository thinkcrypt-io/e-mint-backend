import mongoose from 'mongoose';
import Blog from '../models/blog/model.js';

// Test function to create a blog and check if sequential code is generated
async function testBlogSequentialCode() {
	try {
		console.log('🧪 Testing Blog Sequential Code Generation...');

		// Connect to MongoDB (you might need to adjust the connection string)
		if (!mongoose.connection.readyState) {
			await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
			console.log('✅ Connected to MongoDB');
		}

		// Create a test blog
		const testBlog = new Blog({
			name: 'Test Blog Post for Sequential Code',
			excerpt: 'This is a test excerpt that meets the minimum length requirement of 50 characters.',
			content:
				'This is test content that is long enough to meet the minimum requirement of 500 characters. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
			author: new mongoose.Types.ObjectId(),
			publishedAt: new Date(),
			readTime: '5 min read',
			tags: ['test', 'sequential-code'],
			featuredImage: 'https://example.com/image.jpg',
			slug: 'test-blog-sequential-code-' + Date.now(),
			category: 'Testing',
		});

		console.log('📝 Creating blog document...');
		const savedBlog = await testBlog.save();

		console.log('✅ Blog created successfully!');
		console.log('🔢 Generated code:', savedBlog.code);
		console.log('📄 Blog ID:', savedBlog._id);
		console.log('🏷️  Blog slug:', savedBlog.slug);

		// Test creating another blog to see if code increments
		const testBlog2 = new Blog({
			name: 'Second Test Blog Post for Sequential Code',
			excerpt:
				'This is another test excerpt that meets the minimum length requirement of 50 characters.',
			content:
				'This is another test content that is long enough to meet the minimum requirement of 500 characters. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
			author: new mongoose.Types.ObjectId(),
			publishedAt: new Date(),
			readTime: '3 min read',
			tags: ['test', 'sequential-code', 'second'],
			featuredImage: 'https://example.com/image2.jpg',
			slug: 'second-test-blog-sequential-code-' + Date.now(),
			category: 'Testing',
		});

		console.log('\n📝 Creating second blog document...');
		const savedBlog2 = await testBlog2.save();

		console.log('✅ Second blog created successfully!');
		console.log('🔢 Generated code:', savedBlog2.code);
		console.log('📄 Blog ID:', savedBlog2._id);

		// Verify codes are sequential
		if (savedBlog.code && savedBlog2.code) {
			const code1Num = parseInt(savedBlog.code.split('-')[1]);
			const code2Num = parseInt(savedBlog2.code.split('-')[1]);

			if (code2Num === code1Num + 1) {
				console.log('✅ Sequential code generation working correctly!');
				console.log(`   First code: ${savedBlog.code}`);
				console.log(`   Second code: ${savedBlog2.code}`);
			} else {
				console.log('❌ Sequential code generation not working properly');
			}
		}

		// Clean up test data
		await Blog.deleteMany({ slug: { $regex: /test-blog-sequential-code/ } });
		console.log('🧹 Cleaned up test data');
	} catch (error) {
		console.error('❌ Error testing blog sequential code:', error);
	} finally {
		// Close connection
		await mongoose.connection.close();
		console.log('🔌 MongoDB connection closed');
	}
}

// Run the test
testBlogSequentialCode();
