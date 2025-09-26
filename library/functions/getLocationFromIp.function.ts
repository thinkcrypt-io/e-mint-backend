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
export default getLocationFromIP;
