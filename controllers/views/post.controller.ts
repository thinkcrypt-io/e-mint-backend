import { Request, Response } from 'express';
import { View } from '../../models/index.js';
import { ViewType } from '../../models/views/model.js';

// Helper function to extract device information from user agent
const parseUserAgent = (userAgent: string) => {
	const ua = userAgent.toLowerCase();

	// Device type detection
	let deviceType: 'desktop' | 'tablet' | 'mobile' | 'unknown' = 'unknown';
	if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
		deviceType = 'mobile';
	} else if (ua.includes('tablet') || ua.includes('ipad')) {
		deviceType = 'tablet';
	} else {
		deviceType = 'desktop';
	}

	// Browser detection
	let deviceBrowser = 'unknown';
	let deviceBrowserVersion = '';

	if (ua.includes('chrome') && !ua.includes('chromium') && !ua.includes('edg')) {
		deviceBrowser = 'Chrome';
		const match = ua.match(/chrome\/([0-9.]+)/);
		deviceBrowserVersion = match ? match[1] : '';
	} else if (ua.includes('firefox')) {
		deviceBrowser = 'Firefox';
		const match = ua.match(/firefox\/([0-9.]+)/);
		deviceBrowserVersion = match ? match[1] : '';
	} else if (ua.includes('safari') && !ua.includes('chrome')) {
		deviceBrowser = 'Safari';
		const match = ua.match(/version\/([0-9.]+)/);
		deviceBrowserVersion = match ? match[1] : '';
	} else if (ua.includes('edg')) {
		deviceBrowser = 'Edge';
		const match = ua.match(/edg\/([0-9.]+)/);
		deviceBrowserVersion = match ? match[1] : '';
	} else if (ua.includes('opera') || ua.includes('opr')) {
		deviceBrowser = 'Opera';
		const match = ua.match(/(?:opera|opr)\/([0-9.]+)/);
		deviceBrowserVersion = match ? match[1] : '';
	}

	// OS detection
	let deviceOs = 'unknown';
	let deviceOsVersion = '';

	if (ua.includes('windows nt')) {
		deviceOs = 'Windows';
		const match = ua.match(/windows nt ([0-9.]+)/);
		deviceOsVersion = match ? match[1] : '';
	} else if (ua.includes('mac os x')) {
		deviceOs = 'macOS';
		const match = ua.match(/mac os x ([0-9_]+)/);
		deviceOsVersion = match ? match[1].replace(/_/g, '.') : '';
	} else if (ua.includes('android')) {
		deviceOs = 'Android';
		const match = ua.match(/android ([0-9.]+)/);
		deviceOsVersion = match ? match[1] : '';
	} else if (ua.includes('iphone') || ua.includes('ipad')) {
		deviceOs = 'iOS';
		const match = ua.match(/os ([0-9_]+)/);
		deviceOsVersion = match ? match[1].replace(/_/g, '.') : '';
	} else if (ua.includes('linux')) {
		deviceOs = 'Linux';
	}

	// Brand detection for mobile devices
	let deviceBrand = '';
	let deviceModel = '';

	if (ua.includes('iphone') || ua.includes('ipad')) {
		deviceBrand = 'Apple';
		deviceModel = ua.includes('iphone') ? 'iPhone' : 'iPad';
	} else if (ua.includes('samsung')) {
		deviceBrand = 'Samsung';
	} else if (ua.includes('huawei')) {
		deviceBrand = 'Huawei';
	} else if (ua.includes('xiaomi')) {
		deviceBrand = 'Xiaomi';
	} else if (ua.includes('oppo')) {
		deviceBrand = 'OPPO';
	} else if (ua.includes('vivo')) {
		deviceBrand = 'Vivo';
	} else if (ua.includes('oneplus')) {
		deviceBrand = 'OnePlus';
	}

	return {
		deviceType,
		deviceBrowser,
		deviceBrowserVersion,
		deviceOs,
		deviceOsVersion,
		deviceBrand,
		deviceModel,
	};
};

// Helper function to extract referrer domain
const extractReferrerDomain = (referrer: string | undefined): string | undefined => {
	if (!referrer) return undefined;

	try {
		const url = new URL(referrer);
		return url.hostname;
	} catch (e) {
		return undefined;
	}
};

// Helper function to detect common bots
const detectBot = (userAgent: string) => {
	const botPatterns = [
		'googlebot',
		'bingbot',
		'slurp',
		'duckduckbot',
		'baiduspider',
		'yandexbot',
		'facebookexternalhit',
		'twitterbot',
		'linkedinbot',
		'whatsapp',
		'telegram',
		'crawler',
		'spider',
		'bot',
	];

	const ua = userAgent.toLowerCase();
	const isBot = botPatterns.some(pattern => ua.includes(pattern));

	let botName = '';
	if (isBot) {
		const detectedBot = botPatterns.find(pattern => ua.includes(pattern));
		if (detectedBot) {
			botName = detectedBot.charAt(0).toUpperCase() + detectedBot.slice(1);
		}
	}

	return { isBot, botName };
};

// Helper function to get geolocation from IP address
const getLocationFromIP = async (ipAddress: string) => {
	// Skip geolocation for localhost, private IPs, or unknown IPs
	if (
		!ipAddress ||
		ipAddress === 'unknown' ||
		ipAddress === '127.0.0.1' ||
		ipAddress === '::1' ||
		ipAddress.startsWith('192.168.') ||
		ipAddress.startsWith('10.') ||
		ipAddress.startsWith('172.16.') ||
		ipAddress.startsWith('172.17.') ||
		ipAddress.startsWith('172.18.') ||
		ipAddress.startsWith('172.19.') ||
		ipAddress.startsWith('172.20.') ||
		ipAddress.startsWith('172.21.') ||
		ipAddress.startsWith('172.22.') ||
		ipAddress.startsWith('172.23.') ||
		ipAddress.startsWith('172.24.') ||
		ipAddress.startsWith('172.25.') ||
		ipAddress.startsWith('172.26.') ||
		ipAddress.startsWith('172.27.') ||
		ipAddress.startsWith('172.28.') ||
		ipAddress.startsWith('172.29.') ||
		ipAddress.startsWith('172.30.') ||
		ipAddress.startsWith('172.31.')
	) {
		return {};
	}

	try {
		// Using ip-api.com (free service with rate limits)
		// For production, consider using a paid service like MaxMind or ipapi.co
		const response = await fetch(
			`http://ip-api.com/json/${ipAddress}?fields=status,message,country,countryCode,region,regionName,city,timezone,lat,lon,isp,org,proxy`
		);

		if (!response.ok) {
			return {};
		}

		const data = await response.json();

		if (data.status === 'fail') {
			console.warn(`IP geolocation failed for ${ipAddress}:`, data.message);
			return {};
		}

		return {
			locationCountry: data.country || undefined,
			locationCountryCode: data.countryCode || undefined,
			locationRegion: data.regionName || undefined,
			locationRegionCode: data.region || undefined,
			locationCity: data.city || undefined,
			locationTimezone: data.timezone || undefined,
			locationLatitude: data.lat || undefined,
			locationLongitude: data.lon || undefined,
			locationIsp: data.isp || undefined,
			locationOrganization: data.org || undefined,
			locationProxy: data.proxy || false,
			locationVpn: false, // ip-api.com doesn't provide VPN detection in free tier
			locationTor: false, // ip-api.com doesn't provide Tor detection in free tier
		};
	} catch (error) {
		console.warn(`Error fetching geolocation for IP ${ipAddress}:`, error);
		return {};
	}
};

// Main post controller for tracking views
export const trackViewPost = async (req: Request, res: Response) => {
	try {
		const {
			pageSlug,
			pageTitle,
			pageUrl,
			fingerprint,
			sessionId,
			referrer,
			utmSource,
			utmMedium,
			utmCampaign,
			utmTerm,
			utmContent,
			language,
			acceptLanguage,
			encoding,
			colorDepth,
			pixelRatio,
			touchSupport,
			cookieEnabled,
			javaEnabled,
			screenResolution,
			viewportWidth,
			viewportHeight,
			timezone,
			tags,
			customAttributesLabel,
			customAttributesValue,
		} = req.body;

		// Get visitor information from request
		const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
		const userAgent = req.get('User-Agent') || 'unknown';

		// Parse device information from user agent
		const deviceInfo = parseUserAgent(userAgent);

		// Extract referrer domain
		const referrerDomain = extractReferrerDomain(referrer);

		// Detect bot traffic
		const { isBot, botName } = detectBot(userAgent);

		// Check if this is a unique visitor (based on IP + fingerprint + sessionId)
		const existingView = await View.findOne({
			$or: [
				{ ipAddress, fingerprint },
				{ ipAddress, sessionId },
				{ fingerprint, sessionId },
			].filter(condition => Object.values(condition).every(val => val)),
		}).sort({ visitDate: -1 });

		const isUniqueVisitor = !existingView;
		const isReturnVisitor = !!existingView;
		const visitCount = existingView ? existingView.visitCount + 1 : 1;
		const previousVisitDate = existingView?.visitDate;

		// Get geolocation data from IP address
		const locationData = await getLocationFromIP(ipAddress);

		// Create new view document with flattened structure
		const viewData: Partial<ViewType> = {
			// Page Information
			pageSlug: pageSlug || '/',
			pageTitle,
			pageUrl,

			// Visitor Information
			ipAddress,
			userAgent,
			fingerprint,
			sessionId,

			// Device Information (flattened)
			deviceType: deviceInfo.deviceType,
			deviceBrand: deviceInfo.deviceBrand || undefined,
			deviceModel: deviceInfo.deviceModel || undefined,
			deviceOs: deviceInfo.deviceOs !== 'unknown' ? deviceInfo.deviceOs : undefined,
			deviceOsVersion: deviceInfo.deviceOsVersion || undefined,
			deviceBrowser: deviceInfo.deviceBrowser !== 'unknown' ? deviceInfo.deviceBrowser : undefined,
			deviceBrowserVersion: deviceInfo.deviceBrowserVersion || undefined,
			deviceScreenResolution: screenResolution,
			deviceViewportWidth: viewportWidth,
			deviceViewportHeight: viewportHeight,

			// Location Information (automatically populated from IP geolocation)
			locationTimezone: timezone || locationData.locationTimezone,
			...locationData,

			// Traffic Information
			referrer,
			referrerDomain,
			utmSource,
			utmMedium,
			utmCampaign,
			utmTerm,
			utmContent,

			// Visit Tracking
			isUniqueVisitor,
			isReturnVisitor,
			visitCount,
			previousVisitDate,

			// Engagement Metrics (flattened - initialized with defaults)
			bounceRate: false,
			exitPage: false,
			pagesPerSession: 1,
			interactionClicks: 0,
			interactionScrollDepth: 0,
			interactionDownloads: 0,
			interactionFormSubmissions: 0,

			// Technical Information
			language: language?.toLowerCase(),
			acceptLanguage,
			encoding,
			colorDepth,
			pixelRatio,
			touchSupport: touchSupport || false,
			cookieEnabled: cookieEnabled !== false, // default to true unless explicitly false
			javaEnabled: javaEnabled || false,

			// Business Intelligence
			isBot,
			botName: botName || undefined,
			isDevelopment: process.env.NODE_ENV === 'development',
			isPreview: false, // can be determined from URL patterns or headers

			// Analytics Tags
			tags: tags || [],
			customAttributesLabel,
			customAttributesValue,

			// Timestamps
			visitDate: new Date(),
		};

		// Create and save the view
		const view = new View(viewData);
		await view.save();

		res.status(201).json({
			success: true,
			message: 'View tracked successfully',
			data: {
				viewId: view._id,
				isUniqueVisitor,
				isReturnVisitor,
				visitCount,
				deviceType: deviceInfo.deviceType,
				deviceBrowser: deviceInfo.deviceBrowser,
				deviceOs: deviceInfo.deviceOs,
				isBot,
				botName,
			},
		});
	} catch (error) {
		console.error('Error tracking view:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to track view',
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};

// Update view engagement metrics (for real-time updates)
export const updateViewEngagementPost = async (req: Request, res: Response) => {
	try {
		const { viewId } = req.params;
		const {
			timeOnPage,
			sessionDuration,
			interactionClicks,
			interactionScrollDepth,
			interactionDownloads,
			interactionFormSubmissions,
			bounceRate,
			exitPage,
			pagesPerSession,
		} = req.body;

		const updateData: Partial<ViewType> = {};

		// Update flattened interaction properties
		if (timeOnPage !== undefined) updateData.timeOnPage = timeOnPage;
		if (sessionDuration !== undefined) updateData.sessionDuration = sessionDuration;
		if (interactionClicks !== undefined) updateData.interactionClicks = interactionClicks;
		if (interactionScrollDepth !== undefined)
			updateData.interactionScrollDepth = interactionScrollDepth;
		if (interactionDownloads !== undefined) updateData.interactionDownloads = interactionDownloads;
		if (interactionFormSubmissions !== undefined)
			updateData.interactionFormSubmissions = interactionFormSubmissions;
		if (bounceRate !== undefined) updateData.bounceRate = bounceRate;
		if (exitPage !== undefined) updateData.exitPage = exitPage;
		if (pagesPerSession !== undefined) updateData.pagesPerSession = pagesPerSession;

		const view = await View.findByIdAndUpdate(viewId, updateData, { new: true });

		if (!view) {
			return res.status(404).json({
				success: false,
				message: 'View not found',
			});
		}

		res.json({
			success: true,
			message: 'View engagement updated successfully',
			data: {
				viewId: view._id,
				timeOnPage: view.timeOnPage,
				sessionDuration: view.sessionDuration,
				interactionClicks: view.interactionClicks,
				interactionScrollDepth: view.interactionScrollDepth,
				bounceRate: view.bounceRate,
				exitPage: view.exitPage,
				pagesPerSession: view.pagesPerSession,
			},
		});
	} catch (error) {
		console.error('Error updating view engagement:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to update view engagement',
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};

// Bulk track views (for batch processing)
export const bulkTrackViews = async (req: Request, res: Response) => {
	try {
		const { views } = req.body;

		if (!Array.isArray(views) || views.length === 0) {
			return res.status(400).json({
				success: false,
				message: 'Views array is required and must not be empty',
			});
		}

		const processedViews = [];
		const errors = [];

		for (let i = 0; i < views.length; i++) {
			try {
				const viewData = views[i];
				const userAgent = viewData.userAgent || req.get('User-Agent') || 'unknown';
				const ipAddress = viewData.ipAddress || req.ip || req.connection.remoteAddress || 'unknown';

				const deviceInfo = parseUserAgent(userAgent);
				const referrerDomain = extractReferrerDomain(viewData.referrer);
				const { isBot, botName } = detectBot(userAgent);

				const processedView = {
					...viewData,
					ipAddress,
					userAgent,
					...deviceInfo,
					referrerDomain,
					isBot,
					botName: botName || undefined,
					visitDate: new Date(viewData.visitDate || Date.now()),
					// Set defaults for flattened interaction properties
					interactionClicks: viewData.interactionClicks || 0,
					interactionScrollDepth: viewData.interactionScrollDepth || 0,
					interactionDownloads: viewData.interactionDownloads || 0,
					interactionFormSubmissions: viewData.interactionFormSubmissions || 0,
				};

				// Get location data from IP address
				const locationData = await getLocationFromIP(ipAddress);
				Object.assign(processedView, locationData);

				const view = new View(processedView);
				await view.save();
				processedViews.push({
					index: i,
					viewId: view._id,
					success: true,
				});
			} catch (error) {
				errors.push({
					index: i,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		res.status(201).json({
			success: true,
			message: `Bulk tracking completed. ${processedViews.length} views tracked, ${errors.length} errors.`,
			data: {
				processed: processedViews,
				errors,
				total: views.length,
				successful: processedViews.length,
				failed: errors.length,
			},
		});
	} catch (error) {
		console.error('Error in bulk track views:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to process bulk track views',
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};
