const parseBrowserInfo = (userAgent: string) => {
	const ua = userAgent.toLowerCase();

	// Browser detection
	let browser = 'unknown';
	let browserVersion = '';

	if (ua.includes('edg/')) {
		browser = 'Microsoft Edge';
		const match = ua.match(/edg\/([0-9.]+)/);
		browserVersion = match ? match[1] : '';
	} else if (ua.includes('chrome/') && !ua.includes('chromium/')) {
		browser = 'Google Chrome';
		const match = ua.match(/chrome\/([0-9.]+)/);
		browserVersion = match ? match[1] : '';
	} else if (ua.includes('firefox/')) {
		browser = 'Mozilla Firefox';
		const match = ua.match(/firefox\/([0-9.]+)/);
		browserVersion = match ? match[1] : '';
	} else if (ua.includes('safari/') && !ua.includes('chrome/')) {
		browser = 'Safari';
		const match = ua.match(/version\/([0-9.]+)/);
		browserVersion = match ? match[1] : '';
	} else if (ua.includes('opera/') || ua.includes('opr/')) {
		browser = 'Opera';
		const match = ua.match(/(?:opera|opr)\/([0-9.]+)/);
		browserVersion = match ? match[1] : '';
	}

	// Operating System detection
	let os = 'unknown';
	let osVersion = '';

	if (ua.includes('mac os x')) {
		os = 'macOS';
		const match = ua.match(/mac os x ([0-9_]+)/);
		if (match) {
			osVersion = match[1].replace(/_/g, '.');
			// Convert version numbers to readable names
			if (osVersion.startsWith('10.15')) osVersion = 'Catalina (10.15)';
			else if (osVersion.startsWith('11.')) osVersion = 'Big Sur (11.x)';
			else if (osVersion.startsWith('12.')) osVersion = 'Monterey (12.x)';
			else if (osVersion.startsWith('13.')) osVersion = 'Ventura (13.x)';
			else if (osVersion.startsWith('14.')) osVersion = 'Sonoma (14.x)';
			else if (osVersion.startsWith('15.')) osVersion = 'Sequoia (15.x)';
		}
	} else if (ua.includes('windows nt')) {
		os = 'Windows';
		const match = ua.match(/windows nt ([0-9.]+)/);
		if (match) {
			const version = match[1];
			switch (version) {
				case '10.0':
					osVersion = '10/11';
					break;
				case '6.3':
					osVersion = '8.1';
					break;
				case '6.2':
					osVersion = '8';
					break;
				case '6.1':
					osVersion = '7';
					break;
				default:
					osVersion = version;
			}
		}
	} else if (ua.includes('android')) {
		os = 'Android';
		const match = ua.match(/android ([0-9.]+)/);
		osVersion = match ? match[1] : '';
	} else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
		os = 'iOS';
		const match = ua.match(/os ([0-9_]+)/);
		osVersion = match ? match[1].replace(/_/g, '.') : '';
	} else if (ua.includes('linux')) {
		os = 'Linux';
	}

	// Device type detection
	let deviceType = 'desktop';
	let deviceBrand = '';
	let deviceModel = '';

	if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
		deviceType = 'mobile';
		if (ua.includes('iphone')) {
			deviceBrand = 'Apple';
			deviceModel = 'iPhone';
		}
	} else if (ua.includes('tablet') || ua.includes('ipad')) {
		deviceType = 'tablet';
		if (ua.includes('ipad')) {
			deviceBrand = 'Apple';
			deviceModel = 'iPad';
		}
	} else if (ua.includes('macintosh')) {
		deviceBrand = 'Apple';
		deviceModel = 'Mac';
	}

	return {
		browser,
		browserVersion,
		os,
		osVersion,
		deviceType,
		deviceBrand,
		deviceModel,
	};
};

export default parseBrowserInfo;
