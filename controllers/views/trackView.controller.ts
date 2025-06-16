import { Request, Response } from 'express';
import { getLocationFromIP } from './index.js';
import { View } from '../../models/index.js';
import { ViewType } from '../../models/views/model.js';
import parseBrowserInfo from './parseBrowserInfo.function.js';

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
			customRef: r,
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

		// const ip = req.clientIp || req.ip || 'Unknown IP';
		// const geo = geoip.lookup(ip); // Get location details from IP

		// const location = geo ? `${geo?.city}, ${geo?.region}, ${geo?.country}` : 'Unknown Location';

		const ipAddress = req.clientIp || req.ip || 'unknown';
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
			ipAddress.startsWith('45.248.149.63') ||
			ipAddress.startsWith('103.217.111.') ||
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

		const browserInfo = req.headers['user-agent'] || 'unknown';

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

		const { browser, browserVersion, os, osVersion, deviceType, deviceBrand, deviceModel } =
			parseBrowserInfo(browserInfo);

		// Create new view document
		const viewData: Partial<ViewType> = {
			pageSlug,
			pageTitle,
			pageUrl,
			ipAddress,
			userAgent,
			fingerprint,
			sessionId,
			deviceBrowser: browser || 'unknown',
			deviceOs: os || 'unknown',
			devuceBrand: deviceBrand || 'unknown',
			deviceModel: deviceModel || 'unknown',
			device: device || {},
			deviceType: deviceType || 'other',
			// Apply flattened location data directly to the view document
			...enrichedLocation,
			referrer,
			customRef: r || '',
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

		res.status(201).json(saved);
	} catch (error: any) {
		console.error('Error tracking view:', error);
		res.status(500).json({
			success: false,
			message: error?.message || 'Unknown error',
		});
	}
};
export default trackView;
