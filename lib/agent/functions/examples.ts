import { generateModelSettings, generateModelSettingsAsync } from './generateModelSettings.js';
import type { ModelSettingsResult } from './generateModelSettings.js';

/**
 * Example usage of generateModelSettings function
 */

// Synchronous usage
export const exampleUsage = () => {
	// Example 1: Generate settings for a User model
	const userSettings = generateModelSettings('User');

	if (userSettings.success) {
		console.log('User model fields:', userSettings.keys);
		console.log('User model settings:', userSettings.settings);
		console.log('Available types:', userSettings.types);
	} else {
		console.error('Error:', userSettings.message);
	}

	// Example 2: Generate settings for a Product model
	const productSettings = generateModelSettings('Product');

	if (productSettings.success) {
		// Use the settings to configure your admin interface
		const adminConfig = {
			model: 'Product',
			fields: productSettings.settings,
			searchableFields: productSettings.keys.filter(key => productSettings.settings[key].search),
			sortableFields: productSettings.keys.filter(key => productSettings.settings[key].sort),
		};

		console.log('Admin config for Product:', adminConfig);
	} else {
		console.error('Product model error:', productSettings.message);
	}
};

// Async usage
export const exampleAsyncUsage = async () => {
	try {
		const orderSettings = await generateModelSettingsAsync('Order');

		if (orderSettings.success) {
			// Save to database or use for configuration
			const configData = {
				modelName: 'Order',
				generatedAt: new Date(),
				settings: orderSettings.settings,
				fieldCount: orderSettings.keys.length,
			};

			console.log('Generated config:', configData);
		}
	} catch (error) {
		console.error('Async error:', error);
	}
};

// Function to generate settings for multiple models
export const generateMultipleModelSettings = (modelNames: string[]): ModelSettingsResult[] => {
	return modelNames.map(modelName => generateModelSettings(modelName));
};

// Function to save generated settings to a file (example)
export const saveModelSettingsToFile = (modelName: string, outputPath: string): boolean => {
	try {
		const settings = generateModelSettings(modelName);

		if (!settings.success) {
			console.error(`Failed to generate settings for ${modelName}:`, settings.message);
			return false;
		}

		// In a real scenario, you would use fs.writeFileSync or similar
		const configContent = `// Auto-generated settings for ${modelName} model
export const ${modelName.toLowerCase()}Settings = ${JSON.stringify(settings.settings, null, 2)};

export const ${modelName.toLowerCase()}Fields = ${JSON.stringify(settings.keys, null, 2)};

export default ${modelName.toLowerCase()}Settings;
`;

		console.log(`Settings for ${modelName} generated successfully`);
		console.log(`Content to save to ${outputPath}:`, configContent);

		return true;
	} catch (error) {
		console.error(`Error saving settings for ${modelName}:`, error);
		return false;
	}
};
