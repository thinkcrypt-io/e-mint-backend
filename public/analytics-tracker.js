/**
 * E-Mint Analytics Tracking Script
 *
 * This script provides comprehensive website visitor tracking including:
 * - Page views
 * - Device information
 * - Geolocation (if enabled)
 * - User engagement metrics
 * - UTM campaign tracking
 *
 * Usage:
 * Include this script in your HTML and call:
 * EMintAnalytics.track({ pageSlug: 'home', pageTitle: 'Home Page' });
 */

(function (window, document) {
	'use strict';

	// Configuration
	const CONFIG = {
		API_BASE_URL: 'https://e-mint-c5a78779aa41.herokuapp.com/api/views',
		TRACK_ENDPOINT: '/track',
		ENGAGEMENT_ENDPOINT: '/engagement',
		ENABLE_DEBUG: false,
		ENABLE_GEOLOCATION: true,
		SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
	};

	class EMintAnalytics {
		constructor() {
			this.viewId = null;
			this.sessionId = this.generateSessionId();
			this.fingerprint = this.generateFingerprint();
			this.startTime = Date.now();
			this.lastActivity = Date.now();
			this.interactions = {
				clicks: 0,
				scrollDepth: 0,
				downloads: 0,
				formSubmissions: 0,
			};

			this.init();
		}

		init() {
			this.setupEventListeners();
			this.updateActivity();
		}

		setupEventListeners() {
			// Track clicks
			document.addEventListener('click', e => {
				this.interactions.clicks++;
				this.updateActivity();

				// Track downloads
				if (e.target.href && this.isDownloadLink(e.target.href)) {
					this.interactions.downloads++;
				}
			});

			// Track scroll depth
			let maxScroll = 0;
			window.addEventListener('scroll', () => {
				const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
				const docHeight = document.documentElement.scrollHeight - window.innerHeight;
				const scrollPercent = Math.round((scrollTop / docHeight) * 100);

				if (scrollPercent > maxScroll) {
					maxScroll = scrollPercent;
					this.interactions.scrollDepth = Math.min(maxScroll, 100);
				}

				this.updateActivity();
			});

			// Track form submissions
			document.addEventListener('submit', () => {
				this.interactions.formSubmissions++;
				this.updateActivity();
			});

			// Track page visibility changes
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'hidden') {
					this.updateEngagement();
				}
			});

			// Track page unload
			window.addEventListener('beforeunload', () => {
				this.updateEngagement();
			});

			// Update engagement periodically
			setInterval(() => {
				this.updateEngagement();
			}, 30000); // Every 30 seconds
		}

		generateSessionId() {
			let sessionId = localStorage.getItem('emint_session_id');
			const sessionTime = localStorage.getItem('emint_session_time');

			if (
				!sessionId ||
				!sessionTime ||
				Date.now() - parseInt(sessionTime) > CONFIG.SESSION_TIMEOUT
			) {
				sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
				localStorage.setItem('emint_session_id', sessionId);
			}

			localStorage.setItem('emint_session_time', Date.now().toString());
			return sessionId;
		}

		generateFingerprint() {
			// Create a browser fingerprint based on available characteristics
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			ctx.textBaseline = 'top';
			ctx.font = '14px Arial';
			ctx.fillText('EMint Analytics Fingerprint', 2, 2);

			const fingerprint = [
				navigator.userAgent,
				navigator.language,
				screen.width + 'x' + screen.height,
				screen.colorDepth,
				new Date().getTimezoneOffset(),
				canvas.toDataURL(),
				navigator.hardwareConcurrency || 'unknown',
				navigator.deviceMemory || 'unknown',
			].join('|');

			return this.hashCode(fingerprint).toString();
		}

		hashCode(str) {
			let hash = 0;
			for (let i = 0; i < str.length; i++) {
				const char = str.charCodeAt(i);
				hash = (hash << 5) - hash + char;
				hash = hash & hash; // Convert to 32-bit integer
			}
			return Math.abs(hash);
		}

		getDeviceInfo() {
			const userAgent = navigator.userAgent.toLowerCase();

			// Detect device type
			let deviceType = 'desktop';
			if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(userAgent)) {
				deviceType = 'mobile';
			} else if (/tablet|ipad/.test(userAgent)) {
				deviceType = 'tablet';
			}

			// Detect OS
			let os = 'unknown';
			let osVersion = '';
			if (/windows nt/.test(userAgent)) {
				os = 'Windows';
				const match = userAgent.match(/windows nt ([0-9.]+)/);
				osVersion = match ? match[1] : '';
			} else if (/mac os x/.test(userAgent)) {
				os = 'macOS';
				const match = userAgent.match(/mac os x ([0-9_]+)/);
				osVersion = match ? match[1].replace(/_/g, '.') : '';
			} else if (/android/.test(userAgent)) {
				os = 'Android';
				const match = userAgent.match(/android ([0-9.]+)/);
				osVersion = match ? match[1] : '';
			} else if (/iphone|ipad|ipod/.test(userAgent)) {
				os = 'iOS';
				const match = userAgent.match(/os ([0-9_]+)/);
				osVersion = match ? match[1].replace(/_/g, '.') : '';
			}

			// Detect browser
			let browser = 'unknown';
			let browserVersion = '';
			if (/chrome/.test(userAgent) && !/edge/.test(userAgent)) {
				browser = 'Chrome';
				const match = userAgent.match(/chrome\/([0-9.]+)/);
				browserVersion = match ? match[1] : '';
			} else if (/firefox/.test(userAgent)) {
				browser = 'Firefox';
				const match = userAgent.match(/firefox\/([0-9.]+)/);
				browserVersion = match ? match[1] : '';
			} else if (/safari/.test(userAgent) && !/chrome/.test(userAgent)) {
				browser = 'Safari';
				const match = userAgent.match(/version\/([0-9.]+)/);
				browserVersion = match ? match[1] : '';
			} else if (/edge/.test(userAgent)) {
				browser = 'Edge';
				const match = userAgent.match(/edge\/([0-9.]+)/);
				browserVersion = match ? match[1] : '';
			}

			return {
				type: deviceType,
				os: os,
				osVersion: osVersion,
				browser: browser,
				browserVersion: browserVersion,
				screenResolution: `${screen.width}x${screen.height}`,
				viewport: {
					width: window.innerWidth,
					height: window.innerHeight,
				},
			};
		}

		getUTMParameters() {
			const params = new URLSearchParams(window.location.search);
			return {
				utmSource: params.get('utm_source'),
				utmMedium: params.get('utm_medium'),
				utmCampaign: params.get('utm_campaign'),
				utmTerm: params.get('utm_term'),
				utmContent: params.get('utm_content'),
			};
		}

		getTechnicalInfo() {
			return {
				language: navigator.language,
				acceptLanguage: navigator.languages ? navigator.languages.join(',') : navigator.language,
				encoding: document.characterSet || document.charset,
				colorDepth: screen.colorDepth,
				pixelRatio: window.devicePixelRatio || 1,
				touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
				cookieEnabled: navigator.cookieEnabled,
				javaEnabled: typeof java !== 'undefined',
			};
		}

		isDownloadLink(href) {
			const downloadExtensions = [
				'.pdf',
				'.doc',
				'.docx',
				'.xls',
				'.xlsx',
				'.ppt',
				'.pptx',
				'.zip',
				'.rar',
				'.tar',
				'.gz',
				'.mp3',
				'.mp4',
				'.avi',
				'.mov',
				'.jpg',
				'.jpeg',
				'.png',
				'.gif',
				'.svg',
			];

			return downloadExtensions.some(ext => href.toLowerCase().includes(ext));
		}

		updateActivity() {
			this.lastActivity = Date.now();
		}

		async getGeolocation() {
			if (!CONFIG.ENABLE_GEOLOCATION || !navigator.geolocation) {
				return {};
			}

			return new Promise(resolve => {
				navigator.geolocation.getCurrentPosition(
					position => {
						resolve({
							latitude: position.coords.latitude,
							longitude: position.coords.longitude,
						});
					},
					() => {
						resolve({});
					},
					{ timeout: 5000, enableHighAccuracy: false }
				);
			});
		}

		async track(options = {}) {
			try {
				const location = await this.getGeolocation();

				const trackingData = {
					pageSlug: options.pageSlug || this.getPageSlug(),
					pageTitle: options.pageTitle || document.title,
					pageUrl: window.location.href,
					fingerprint: this.fingerprint,
					sessionId: this.sessionId,
					device: this.getDeviceInfo(),
					location: location,
					referrer: document.referrer,
					...this.getUTMParameters(),
					interactions: { ...this.interactions },
					...this.getTechnicalInfo(),
					customAttributes: options.customAttributes || [],
					tags: options.tags || [],
				};

				const response = await fetch(CONFIG.API_BASE_URL + CONFIG.TRACK_ENDPOINT, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(trackingData),
				});

				if (response.ok) {
					const result = await response.json();
					this.viewId = result.data?.viewId;

					if (CONFIG.ENABLE_DEBUG) {
						console.log('EMint Analytics: Page view tracked', result);
					}
				} else {
					console.error('EMint Analytics: Failed to track page view');
				}
			} catch (error) {
				console.error('EMint Analytics: Error tracking page view', error);
			}
		}

		async updateEngagement() {
			if (!this.viewId) return;

			try {
				const timeOnPage = Math.round((Date.now() - this.startTime) / 1000);
				const sessionDuration = Math.round((this.lastActivity - this.startTime) / 1000);

				const engagementData = {
					timeOnPage: timeOnPage,
					sessionDuration: sessionDuration,
					interactions: { ...this.interactions },
					bounceRate: this.interactions.clicks === 0 && timeOnPage < 10,
					exitPage: true, // This will be updated if user navigates to another page
				};

				await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENGAGEMENT_ENDPOINT}/${this.viewId}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(engagementData),
				});

				if (CONFIG.ENABLE_DEBUG) {
					console.log('EMint Analytics: Engagement updated', engagementData);
				}
			} catch (error) {
				console.error('EMint Analytics: Error updating engagement', error);
			}
		}

		getPageSlug() {
			const path = window.location.pathname;
			return path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '-');
		}

		// Public methods
		setCustomAttribute(label, value) {
			if (!this.customAttributes) {
				this.customAttributes = [];
			}
			this.customAttributes.push({ label, value });
		}

		addTag(tag) {
			if (!this.tags) {
				this.tags = [];
			}
			this.tags.push(tag);
		}

		trackEvent(eventName, eventData = {}) {
			if (CONFIG.ENABLE_DEBUG) {
				console.log(`EMint Analytics: Custom event - ${eventName}`, eventData);
			}

			// Update interactions based on event type
			switch (eventName) {
				case 'download':
					this.interactions.downloads++;
					break;
				case 'form_submit':
					this.interactions.formSubmissions++;
					break;
				case 'click':
					this.interactions.clicks++;
					break;
			}

			this.updateActivity();
		}
	}

	// Initialize analytics
	const analytics = new EMintAnalytics();

	// Auto-track page view on load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			analytics.track();
		});
	} else {
		analytics.track();
	}

	// Expose to global scope
	window.EMintAnalytics = {
		track: options => analytics.track(options),
		trackEvent: (eventName, eventData) => analytics.trackEvent(eventName, eventData),
		setCustomAttribute: (label, value) => analytics.setCustomAttribute(label, value),
		addTag: tag => analytics.addTag(tag),
		updateEngagement: () => analytics.updateEngagement(),
		config: CONFIG,
	};
})(window, document);
