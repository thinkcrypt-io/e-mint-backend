import { Request, Response } from 'express';
import { View } from '../../models/index.js';
import { ViewType } from '../../models/views/model.js';

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
		return null;
	}

	try {
		// Using ip-api.com (free service with rate limits)
		// For production, consider using a paid service like MaxMind or ipapi.co
		const response = await fetch(
			`http://ip-api.com/json/${ipAddress}?fields=status,message,country,countryCode,region,regionName,city,timezone,lat,lon,isp,org`
		);

		if (!response.ok) {
			return null;
		}

		const data = await response.json();

		if (data.status === 'fail') {
			console.warn(`IP geolocation failed for ${ipAddress}:`, data.message);
			return null;
		}

		return {
			country: data.country || undefined,
			countryCode: data.countryCode || undefined,
			region: data.regionName || undefined,
			regionCode: data.region || undefined,
			city: data.city || undefined,
			timezone: data.timezone || undefined,
			latitude: data.lat || undefined,
			longitude: data.lon || undefined,
			isp: data.isp || undefined,
			organization: data.org || undefined,
		};
	} catch (error) {
		console.warn(`Error fetching geolocation for IP ${ipAddress}:`, error);
		return null;
	}
};

// Track a page view
export const trackView = async (req: Request, res: Response) => {
	try {
		const {
			pageSlug,
			pageTitle,
			pageUrl,
			fingerprint,
			sessionId,
			device,
			location,
			referrer,
			utmSource,
			utmMedium,
			utmCampaign,
			utmTerm,
			utmContent,
			interactions,
			language,
			customAttributes,
			tags,
		} = req.body;

		// Get visitor information from request
		const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
		const userAgent = req.get('User-Agent') || 'unknown';

		// Skip tracking for localhost requests
		if (
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
			ipAddress.startsWith('172.31.') ||
			req.get('host')?.includes('localhost') ||
			req.get('host')?.includes('127.0.0.1')
		) {
			return res.status(200).json({
				success: true,
				message: 'Localhost tracking skipped',
				data: {
					skipped: true,
					reason: 'localhost_request',
					ipAddress: ipAddress,
					host: req.get('host'),
				},
			});
		}

		// Get geolocation data from IP address
		const geoLocationData = await getLocationFromIP(ipAddress);

		// Map geolocation data to flattened schema fields
		const locationData = geoLocationData
			? {
					locationCountry: geoLocationData.country,
					locationCountryCode: geoLocationData.countryCode,
					locationRegion: geoLocationData.region,
					locationRegionCode: geoLocationData.regionCode,
					locationCity: geoLocationData.city,
					locationTimezone: geoLocationData.timezone,
					locationLatitude: geoLocationData.latitude,
					locationLongitude: geoLocationData.longitude,
					locationIsp: geoLocationData.isp,
					locationOrganization: geoLocationData.organization,
				}
			: {};

		// Merge provided location with geolocation data (prioritize provided data)
		const enrichedLocation = {
			...locationData, // Flattened geolocation data
			...location, // User-provided location data takes precedence
		};

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

		// Create new view document
		const viewData: Partial<ViewType> = {
			pageSlug,
			pageTitle,
			pageUrl,
			ipAddress,
			userAgent,
			fingerprint,
			sessionId,
			device: device || {},
			// Apply flattened location data directly to the view document
			...enrichedLocation,
			referrer,
			utmSource,
			utmMedium,
			utmCampaign,
			utmTerm,
			utmContent,
			isUniqueVisitor,
			isReturnVisitor,
			visitCount,
			previousVisitDate,
			interactions: interactions || {
				clicks: 0,
				scrollDepth: 0,
				downloads: 0,
				formSubmissions: 0,
			},
			language,
			customAttributes,
			tags,
			visitDate: new Date(),
		};

		const view = new View(viewData);
		const saved = await view.save();

		res.status(201).json({
			success: true,
			message: 'View tracked successfully',
			saved,
			data: {
				viewId: view._id,
				isUniqueVisitor,
				visitCount,
				location: {
					country: enrichedLocation.locationCountry,
					city: enrichedLocation.locationCity,
					region: enrichedLocation.locationRegion,
					timezone: enrichedLocation.locationTimezone,
				},
				ipAddress: ipAddress !== 'unknown' ? ipAddress : undefined,
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

// Update view engagement metrics
export const updateViewEngagement = async (req: Request, res: Response) => {
	try {
		const { viewId } = req.params;
		const { timeOnPage, sessionDuration, interactions, bounceRate, exitPage, pagesPerSession } =
			req.body;

		const updateData: Partial<ViewType> = {};

		if (timeOnPage !== undefined) updateData.timeOnPage = timeOnPage;
		if (sessionDuration !== undefined) updateData.sessionDuration = sessionDuration;
		if (interactions !== undefined) updateData.interactions = interactions;
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
			data: view,
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

// Get analytics summary
export const getAnalyticsSummary = async (req: Request, res: Response) => {
	try {
		const { startDate, endDate, pageSlug, country } = req.query;

		const options: any = {};

		if (startDate) options.startDate = new Date(startDate as string);
		if (endDate) options.endDate = new Date(endDate as string);
		if (pageSlug) options.pageSlug = pageSlug as string;
		if (country) options.country = country as string;

		const summary = await (View as any).getAnalyticsSummary(options);

		res.json({
			success: true,
			data: summary[0] || {
				totalViews: 0,
				uniqueVisitors: 0,
				returningVisitors: 0,
				avgTimeOnPage: 0,
				avgScrollDepth: 0,
				totalClicks: 0,
				botTraffic: 0,
			},
		});
	} catch (error) {
		console.error('Error getting analytics summary:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to get analytics summary',
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};

// Get top pages
export const getTopPages = async (req: Request, res: Response) => {
	try {
		const { limit = '10', startDate, endDate } = req.query;

		const limitNum = parseInt(limit as string, 10);
		const startDateObj = startDate ? new Date(startDate as string) : undefined;
		const endDateObj = endDate ? new Date(endDate as string) : undefined;

		const topPages = await (View as any).getTopPages(limitNum, startDateObj, endDateObj);

		res.json({
			success: true,
			data: topPages,
		});
	} catch (error) {
		console.error('Error getting top pages:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to get top pages',
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};

// Get traffic sources
export const getTrafficSources = async (req: Request, res: Response) => {
	try {
		const { limit = '10', startDate, endDate } = req.query;

		const limitNum = parseInt(limit as string, 10);
		const startDateObj = startDate ? new Date(startDate as string) : undefined;
		const endDateObj = endDate ? new Date(endDate as string) : undefined;

		const trafficSources = await (View as any).getTrafficSources(
			limitNum,
			startDateObj,
			endDateObj
		);

		res.json({
			success: true,
			data: trafficSources,
		});
	} catch (error) {
		console.error('Error getting traffic sources:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to get traffic sources',
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};

// Get geographic data
export const getGeographicData = async (req: Request, res: Response) => {
	try {
		const { startDate, endDate } = req.query;

		const startDateObj = startDate ? new Date(startDate as string) : undefined;
		const endDateObj = endDate ? new Date(endDate as string) : undefined;

		const geographicData = await (View as any).getGeographicData(startDateObj, endDateObj);

		res.json({
			success: true,
			data: geographicData,
		});
	} catch (error) {
		console.error('Error getting geographic data:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to get geographic data',
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};

// Get real-time analytics
export const getRealTimeAnalytics = async (req: Request, res: Response) => {
	try {
		const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

		const recentViews = await View.find({
			visitDate: { $gte: fifteenMinutesAgo },
			isBot: { $ne: true },
		})
			.sort({ visitDate: -1 })
			.limit(100)
			.select('pageSlug pageTitle location.country device.type visitDate isUniqueVisitor');

		const activeVisitors = await View.countDocuments({
			visitDate: { $gte: fifteenMinutesAgo },
			isBot: { $ne: true },
		});

		const topActivePagesLast15Min = await View.aggregate([
			{
				$match: {
					visitDate: { $gte: fifteenMinutesAgo },
					isBot: { $ne: true },
				},
			},
			{
				$group: {
					_id: '$pageSlug',
					views: { $sum: 1 },
					uniqueVisitors: { $sum: { $cond: ['$isUniqueVisitor', 1, 0] } },
				},
			},
			{ $sort: { views: -1 } },
			{ $limit: 5 },
		]);

		res.json({
			success: true,
			data: {
				activeVisitors,
				recentViews,
				topActivePages: topActivePagesLast15Min,
				lastUpdated: new Date(),
			},
		});
	} catch (error) {
		console.error('Error getting real-time analytics:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to get real-time analytics',
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};

// Export post controller functions
export { trackViewPost, updateViewEngagementPost, bulkTrackViews } from './post.controller.js';
