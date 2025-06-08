#!/usr/bin/env node

/**
 * Automated JWT Token Manager for E-Mint Backend API
 *
 * This script provides automated token generation and management for testing
 * REST API routes with proper authentication.
 *
 * Features:
 * - Automatic login and token retrieval
 * - Token caching and refresh
 * - Support for different user types (admin, user, staff)
 * - Environment-based configuration
 * - HTTP client with automatic token injection
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
	// API Base URLs - adjust these according to your setup
	BASE_URL: process.env.API_BASE_URL || 'http://localhost:5000',

	// Authentication endpoints
	ENDPOINTS: {
		ADMIN_LOGIN: '/admin/api/auth/login',
		USER_LOGIN: '/api/auth/login',
		STAFF_LOGIN: '/staff-api/auth/login',
		USER_API_LOGIN: '/user-api/auth/login',
	},

	// Token storage file
	TOKEN_FILE: path.join(__dirname, '.auth-tokens.json'),

	// Default credentials - CHANGE THESE FOR PRODUCTION
	CREDENTIALS: {
		admin: {
			email: process.env.ADMIN_EMAIL || 'admin@example.com',
			password: process.env.ADMIN_PASSWORD || 'password123',
		},
		user: {
			email: process.env.USER_EMAIL || 'user@example.com',
			password: process.env.USER_PASSWORD || 'password123',
		},
		staff: {
			email: process.env.STAFF_EMAIL || 'staff@example.com',
			password: process.env.STAFF_PASSWORD || 'password123',
		},
	},
};

class TokenManager {
	constructor() {
		this.tokens = this.loadTokens();
		this.httpClient = this.createHttpClient();
	}

	/**
	 * Load cached tokens from file
	 */
	loadTokens() {
		try {
			if (fs.existsSync(CONFIG.TOKEN_FILE)) {
				const data = fs.readFileSync(CONFIG.TOKEN_FILE, 'utf8');
				return JSON.parse(data);
			}
		} catch (error) {
			console.warn('Could not load cached tokens:', error.message);
		}
		return {};
	}

	/**
	 * Save tokens to file
	 */
	saveTokens() {
		try {
			fs.writeFileSync(CONFIG.TOKEN_FILE, JSON.stringify(this.tokens, null, 2));
		} catch (error) {
			console.warn('Could not save tokens:', error.message);
		}
	}

	/**
	 * Check if a token is valid (not expired)
	 */
	isTokenValid(tokenData) {
		if (!tokenData || !tokenData.token || !tokenData.expires) {
			return false;
		}

		const now = new Date().getTime();
		const expires = new Date(tokenData.expires).getTime();

		// Add 5 minute buffer for token expiry
		return expires > now + 5 * 60 * 1000;
	}

	/**
	 * Login and get token for specific user type
	 */
	async login(userType) {
		const credentials = CONFIG.CREDENTIALS[userType];
		if (!credentials) {
			throw new Error(`Unknown user type: ${userType}`);
		}

		let endpoint;
		switch (userType) {
			case 'admin':
				endpoint = CONFIG.ENDPOINTS.ADMIN_LOGIN;
				break;
			case 'user':
				endpoint = CONFIG.ENDPOINTS.USER_LOGIN;
				break;
			case 'staff':
				endpoint = CONFIG.ENDPOINTS.STAFF_LOGIN;
				break;
			case 'userApi':
				endpoint = CONFIG.ENDPOINTS.USER_API_LOGIN;
				break;
			default:
				throw new Error(`No endpoint configured for user type: ${userType}`);
		}

		try {
			console.log(`🔐 Logging in as ${userType}...`);

			const response = await axios.post(`${CONFIG.BASE_URL}${endpoint}`, {
				email: credentials.email,
				password: credentials.password,
			});

			if (response.data && response.data.token) {
				const token = response.data.token;

				// Calculate expiry (assuming 24 hours if not provided)
				const expiryTime = new Date();
				expiryTime.setHours(expiryTime.getHours() + 24);

				const tokenData = {
					token: token,
					expires: expiryTime.toISOString(),
					userType: userType,
					email: credentials.email,
					lastUpdated: new Date().toISOString(),
				};

				this.tokens[userType] = tokenData;
				this.saveTokens();

				console.log(`✅ Successfully logged in as ${userType}`);
				console.log(`🎫 Token: ${token.substring(0, 20)}...`);

				return token;
			} else {
				throw new Error('No token received in response');
			}
		} catch (error) {
			console.error(
				`❌ Login failed for ${userType}:`,
				error.response?.data?.message || error.message
			);
			throw error;
		}
	}

	/**
	 * Get valid token for user type (login if needed)
	 */
	async getToken(userType) {
		const cachedToken = this.tokens[userType];

		if (this.isTokenValid(cachedToken)) {
			console.log(`🎫 Using cached token for ${userType}`);
			return cachedToken.token;
		}

		console.log(`🔄 Token expired or not found for ${userType}, logging in...`);
		return await this.login(userType);
	}

	/**
	 * Create HTTP client with automatic token injection
	 */
	createHttpClient() {
		const client = axios.create({
			baseURL: CONFIG.BASE_URL,
			timeout: 30000,
			headers: {
				'Content-Type': 'application/json',
			},
		});

		// Add request interceptor to inject token
		client.interceptors.request.use(async config => {
			if (config.userType && !config.headers.Authorization) {
				try {
					const token = await this.getToken(config.userType);
					config.headers.Authorization = token;
				} catch (error) {
					console.warn(`Could not get token for ${config.userType}:`, error.message);
				}
			}
			return config;
		});

		// Add response interceptor to handle auth errors
		client.interceptors.response.use(
			response => response,
			async error => {
				if (error.response?.status === 401 && error.config?.userType) {
					console.log(`🔄 Auth error, refreshing token for ${error.config.userType}...`);

					// Remove cached token and retry
					delete this.tokens[error.config.userType];
					this.saveTokens();

					try {
						const newToken = await this.login(error.config.userType);
						error.config.headers.Authorization = newToken;
						return client.request(error.config);
					} catch (loginError) {
						console.error('Failed to refresh token:', loginError.message);
					}
				}
				return Promise.reject(error);
			}
		);

		return client;
	}

	/**
	 * Make authenticated API request
	 */
	async request(options) {
		const { userType, method = 'GET', url, data, headers = {} } = options;

		return this.httpClient.request({
			method,
			url,
			data,
			headers,
			userType,
		});
	}

	/**
	 * Convenience methods for different HTTP methods
	 */
	async get(url, userType, options = {}) {
		return this.request({ method: 'GET', url, userType, ...options });
	}

	async post(url, data, userType, options = {}) {
		return this.request({ method: 'POST', url, data, userType, ...options });
	}

	async put(url, data, userType, options = {}) {
		return this.request({ method: 'PUT', url, data, userType, ...options });
	}

	async delete(url, userType, options = {}) {
		return this.request({ method: 'DELETE', url, userType, ...options });
	}

	/**
	 * Clear all cached tokens
	 */
	clearTokens() {
		this.tokens = {};
		this.saveTokens();
		console.log('🗑️  All tokens cleared');
	}

	/**
	 * Show token status
	 */
	showStatus() {
		console.log('\n📊 Token Status:');
		console.log('================');

		if (Object.keys(this.tokens).length === 0) {
			console.log('No tokens cached');
			return;
		}

		for (const [userType, tokenData] of Object.entries(this.tokens)) {
			const isValid = this.isTokenValid(tokenData);
			const status = isValid ? '✅ Valid' : '❌ Expired';
			const expires = new Date(tokenData.expires).toLocaleString();

			console.log(`${userType}: ${status} (expires: ${expires})`);
		}
	}

	/**
	 * Test all endpoints with authentication
	 */
	async testEndpoints() {
		console.log('\n🧪 Testing API Endpoints:');
		console.log('=========================');

		const testCases = [
			{ userType: 'admin', endpoint: '/admin/api/auth/self', description: 'Admin self endpoint' },
			{ userType: 'user', endpoint: '/api/auth/self', description: 'User self endpoint' },
			{ userType: 'staff', endpoint: '/staff-api/auth/self', description: 'Staff self endpoint' },
		];

		for (const test of testCases) {
			try {
				console.log(`\n🔍 Testing ${test.description}...`);
				const response = await this.get(test.endpoint, test.userType);
				console.log(
					`✅ Success: ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}...`
				);
			} catch (error) {
				console.log(
					`❌ Failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`
				);
			}
		}
	}
}

// CLI Interface
async function main() {
	const tokenManager = new TokenManager();
	const args = process.argv.slice(2);
	const command = args[0];

	try {
		switch (command) {
			case 'login':
				const userType = args[1] || 'admin';
				await tokenManager.getToken(userType);
				break;

			case 'clear':
				tokenManager.clearTokens();
				break;

			case 'status':
				tokenManager.showStatus();
				break;

			case 'test':
				await tokenManager.testEndpoints();
				break;

			case 'request':
				const method = args[1] || 'GET';
				const url = args[2];
				const requestUserType = args[3] || 'admin';

				if (!url) {
					console.error('Usage: node token-manager.js request <method> <url> [userType]');
					process.exit(1);
				}

				const response = await tokenManager.request({
					method: method.toUpperCase(),
					url,
					userType: requestUserType,
				});

				console.log(`Status: ${response.status}`);
				console.log('Response:', JSON.stringify(response.data, null, 2));
				break;

			default:
				console.log(`
🚀 E-Mint API Token Manager

Usage:
  node token-manager.js <command> [options]

Commands:
  login [userType]     - Login and cache token (admin, user, staff)
  clear               - Clear all cached tokens
  status              - Show token status
  test                - Test API endpoints
  request <method> <url> [userType] - Make authenticated API request

Examples:
  node token-manager.js login admin
  node token-manager.js request GET /admin/api/auth/self admin
  node token-manager.js request POST /api/products user
  node token-manager.js status
  node token-manager.js test

Environment Variables:
  API_BASE_URL        - Base URL for the API (default: http://localhost:5000)
  ADMIN_EMAIL         - Admin login email
  ADMIN_PASSWORD      - Admin login password
  USER_EMAIL          - User login email
  USER_PASSWORD       - User login password
  STAFF_EMAIL         - Staff login email
  STAFF_PASSWORD      - Staff login password
                `);
				break;
		}
	} catch (error) {
		console.error('❌ Error:', error.message);
		process.exit(1);
	}
}

// Export for use as module
export default TokenManager;

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
