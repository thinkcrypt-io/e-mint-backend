/**
 * Comprehensive API Testing Suite for E-Mint Backend
 *
 * This script provides automated testing of various API endpoints
 * with proper authentication and error handling.
 */

import TokenManager from './token-manager.js';
import chalk from 'chalk';

class APITester {
	constructor() {
		this.tokenManager = new TokenManager();
		this.results = {
			passed: 0,
			failed: 0,
			total: 0,
		};
	}

	/**
	 * Test suite configuration
	 */
	getTestSuites() {
		return {
			admin: {
				description: 'Admin API Tests',
				userType: 'admin',
				baseUrl: '/admin/api',
				tests: [
					{
						name: 'Get admin profile',
						method: 'GET',
						endpoint: '/auth/self',
						expectedStatus: 200,
					},
					{
						name: 'List shops',
						method: 'GET',
						endpoint: '/shops',
						expectedStatus: 200,
					},
					{
						name: 'List sellers',
						method: 'GET',
						endpoint: '/sellers',
						expectedStatus: 200,
					},
					{
						name: 'List customers',
						method: 'GET',
						endpoint: '/customers',
						expectedStatus: 200,
					},
				],
			},
			user: {
				description: 'User/Seller API Tests',
				userType: 'user',
				baseUrl: '/api',
				tests: [
					{
						name: 'Get user profile',
						method: 'GET',
						endpoint: '/auth/self',
						expectedStatus: 200,
					},
					{
						name: 'List products',
						method: 'GET',
						endpoint: '/products',
						expectedStatus: 200,
					},
					{
						name: 'List orders',
						method: 'GET',
						endpoint: '/orders',
						expectedStatus: 200,
					},
					{
						name: 'List customers',
						method: 'GET',
						endpoint: '/customers',
						expectedStatus: 200,
					},
				],
			},
			staff: {
				description: 'Staff API Tests',
				userType: 'staff',
				baseUrl: '/staff-api',
				tests: [
					{
						name: 'Get staff profile',
						method: 'GET',
						endpoint: '/auth/self',
						expectedStatus: 200,
					},
					{
						name: 'List products',
						method: 'GET',
						endpoint: '/products',
						expectedStatus: 200,
					},
					{
						name: 'List orders',
						method: 'GET',
						endpoint: '/orders',
						expectedStatus: 200,
					},
				],
			},
			userApi: {
				description: 'User API Tests (Customer facing)',
				userType: 'userApi',
				baseUrl: '/user-api',
				tests: [
					{
						name: 'Get store info',
						method: 'GET',
						endpoint: '/store',
						expectedStatus: 200,
						headers: { store: '0001' }, // Default store header
					},
					{
						name: 'List categories',
						method: 'GET',
						endpoint: '/categories',
						expectedStatus: 200,
						headers: { store: '0001' },
					},
					{
						name: 'List products',
						method: 'GET',
						endpoint: '/products',
						expectedStatus: 200,
						headers: { store: '0001' },
					},
				],
			},
		};
	}

	/**
	 * Run a single test
	 */
	async runTest(test, userType, baseUrl) {
		this.results.total++;
		const fullUrl = `${baseUrl}${test.endpoint}`;

		try {
			console.log(`  🧪 ${test.name}...`);

			const options = {
				method: test.method,
				url: fullUrl,
				userType,
				headers: test.headers || {},
			};

			if (test.data) {
				options.data = test.data;
			}

			const response = await this.tokenManager.request(options);

			if (response.status === test.expectedStatus) {
				console.log(`    ✅ ${chalk.green('PASS')} - Status: ${response.status}`);
				this.results.passed++;

				// Log response summary if available
				if (response.data) {
					if (Array.isArray(response.data)) {
						console.log(`    📊 Returned ${response.data.length} items`);
					} else if (response.data.name || response.data.email) {
						console.log(`    👤 User: ${response.data.name || response.data.email}`);
					}
				}

				return { success: true, response };
			} else {
				console.log(
					`    ❌ ${chalk.red('FAIL')} - Expected: ${test.expectedStatus}, Got: ${response.status}`
				);
				this.results.failed++;
				return { success: false, error: `Status mismatch` };
			}
		} catch (error) {
			const status = error.response?.status || 'Network Error';
			const message = error.response?.data?.message || error.message;

			if (status === test.expectedStatus) {
				console.log(`    ✅ ${chalk.green('PASS')} - Expected error: ${status}`);
				this.results.passed++;
				return { success: true, response: error.response };
			} else {
				console.log(`    ❌ ${chalk.red('FAIL')} - Status: ${status}, Message: ${message}`);
				this.results.failed++;
				return { success: false, error: message };
			}
		}
	}

	/**
	 * Run test suite
	 */
	async runTestSuite(suiteName, suite) {
		console.log(`\n${chalk.blue('▶')} ${chalk.bold(suite.description)}`);
		console.log(`${chalk.gray('─'.repeat(50))}`);

		const results = [];

		for (const test of suite.tests) {
			const result = await this.runTest(test, suite.userType, suite.baseUrl);
			results.push({ test, result });

			// Add small delay between tests
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		return results;
	}

	/**
	 * Run all tests
	 */
	async runAllTests() {
		console.log(chalk.blue.bold('\n🚀 Starting E-Mint API Test Suite\n'));

		const testSuites = this.getTestSuites();
		const allResults = {};

		for (const [suiteName, suite] of Object.entries(testSuites)) {
			try {
				allResults[suiteName] = await this.runTestSuite(suiteName, suite);
			} catch (error) {
				console.log(`❌ Failed to run ${suiteName} suite:`, error.message);
				allResults[suiteName] = { error: error.message };
			}
		}

		this.printSummary();
		return allResults;
	}

	/**
	 * Run specific test suite
	 */
	async runSuite(suiteName) {
		const testSuites = this.getTestSuites();
		const suite = testSuites[suiteName];

		if (!suite) {
			throw new Error(
				`Unknown test suite: ${suiteName}. Available: ${Object.keys(testSuites).join(', ')}`
			);
		}

		console.log(chalk.blue.bold(`\n🚀 Starting ${suite.description}\n`));

		const results = await this.runTestSuite(suiteName, suite);
		this.printSummary();

		return results;
	}

	/**
	 * Print test summary
	 */
	printSummary() {
		console.log(`\n${chalk.blue('📊 Test Summary')}`);
		console.log(`${chalk.gray('═'.repeat(30))}`);
		console.log(`Total Tests: ${this.results.total}`);
		console.log(`${chalk.green('✅ Passed:')} ${this.results.passed}`);
		console.log(`${chalk.red('❌ Failed:')} ${this.results.failed}`);

		if (this.results.failed === 0) {
			console.log(`\n${chalk.green.bold('🎉 All tests passed!')}`);
		} else {
			console.log(`\n${chalk.red.bold('💥 Some tests failed!')}`);
		}
	}

	/**
	 * Test specific endpoint with custom parameters
	 */
	async testEndpoint(options) {
		const { method = 'GET', endpoint, userType = 'admin', data, headers } = options;

		console.log(`\n🧪 Testing ${method} ${endpoint} (${userType})`);

		try {
			const response = await this.tokenManager.request({
				method,
				url: endpoint,
				userType,
				data,
				headers,
			});

			console.log(`✅ Success - Status: ${response.status}`);
			console.log('Response:', JSON.stringify(response.data, null, 2));

			return response;
		} catch (error) {
			const status = error.response?.status || 'Network Error';
			const message = error.response?.data?.message || error.message;

			console.log(`❌ Failed - Status: ${status}`);
			console.log(`Error: ${message}`);

			if (error.response?.data) {
				console.log('Response:', JSON.stringify(error.response.data, null, 2));
			}

			throw error;
		}
	}

	/**
	 * Performance test for an endpoint
	 */
	async performanceTest(endpoint, userType = 'admin', requests = 10) {
		console.log(`\n⚡ Performance Testing ${endpoint} (${requests} requests)`);

		const times = [];
		const results = { success: 0, failed: 0 };

		for (let i = 0; i < requests; i++) {
			const start = Date.now();

			try {
				await this.tokenManager.get(endpoint, userType);
				results.success++;
			} catch (error) {
				results.failed++;
			}

			times.push(Date.now() - start);
			process.stdout.write('.');
		}

		console.log('\n');

		const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
		const minTime = Math.min(...times);
		const maxTime = Math.max(...times);

		console.log(`📊 Performance Results:`);
		console.log(`  Success: ${results.success}/${requests}`);
		console.log(`  Failed: ${results.failed}/${requests}`);
		console.log(`  Average: ${avgTime.toFixed(2)}ms`);
		console.log(`  Min: ${minTime}ms`);
		console.log(`  Max: ${maxTime}ms`);

		return { avgTime, minTime, maxTime, results };
	}
}

// CLI Interface
async function main() {
	const args = process.argv.slice(2);
	const command = args[0];
	const tester = new APITester();

	try {
		switch (command) {
			case 'all':
				await tester.runAllTests();
				break;

			case 'suite':
				const suiteName = args[1];
				if (!suiteName) {
					console.error('Usage: node api-tester.js suite <suiteName>');
					console.error('Available suites: admin, user, staff, userApi');
					process.exit(1);
				}
				await tester.runSuite(suiteName);
				break;

			case 'endpoint':
				const method = args[1] || 'GET';
				const endpoint = args[2];
				const userType = args[3] || 'admin';

				if (!endpoint) {
					console.error('Usage: node api-tester.js endpoint <method> <endpoint> [userType]');
					process.exit(1);
				}

				await tester.testEndpoint({ method, endpoint, userType });
				break;

			case 'performance':
				const perfEndpoint = args[1];
				const perfUserType = args[2] || 'admin';
				const requests = parseInt(args[3]) || 10;

				if (!perfEndpoint) {
					console.error('Usage: node api-tester.js performance <endpoint> [userType] [requests]');
					process.exit(1);
				}

				await tester.performanceTest(perfEndpoint, perfUserType, requests);
				break;

			default:
				console.log(`
🧪 E-Mint API Testing Suite

Usage:
  node api-tester.js <command> [options]

Commands:
  all                           - Run all test suites
  suite <name>                  - Run specific test suite (admin, user, staff, userApi)
  endpoint <method> <url> [type] - Test specific endpoint
  performance <url> [type] [n]  - Performance test endpoint

Examples:
  node api-tester.js all
  node api-tester.js suite admin
  node api-tester.js endpoint GET /admin/api/auth/self admin
  node api-tester.js performance /api/products user 20

Test Suites:
  admin    - Admin panel API endpoints
  user     - Seller/User API endpoints  
  staff    - Staff API endpoints
  userApi  - Customer-facing API endpoints
                `);
				break;
		}
	} catch (error) {
		console.error('❌ Error:', error.message);
		process.exit(1);
	}
}

// Export for use as module
export default APITester;

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
