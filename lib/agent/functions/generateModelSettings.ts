import mongoose from 'mongoose';
import { setttingsTypeOptions, Settings, Filter } from '../../types/settings.types.js';

export interface ModelSettingsResult {
	keys: string[];
	settings: Settings;
	types: typeof setttingsTypeOptions;
	success: boolean;
	message?: string;
}

/**
 * Generates model settings configuration for a given Mongoose model
 * @param modelName - The name of the Mongoose model
 * @returns Object containing keys, settings, types, and success status
 */
export const generateModelSettings = (modelName: string): ModelSettingsResult => {
	try {
		// Validate input
		if (!modelName || typeof modelName !== 'string') {
			return {
				keys: [],
				settings: {},
				types: setttingsTypeOptions,
				success: false,
				message: 'Please provide a valid Model Name.',
			};
		}

		let model: mongoose.Model<any>;

		try {
			// Get the mongoose model
			model = mongoose.model(modelName);
		} catch (error) {
			return {
				keys: [],
				settings: {},
				types: setttingsTypeOptions,
				success: false,
				message: `Model '${modelName}' not found. Make sure the model is registered with Mongoose.`,
			};
		}

		if (!model || !model.schema) {
			return {
				keys: [],
				settings: {},
				types: setttingsTypeOptions,
				success: false,
				message: `Model '${modelName}' does not have a valid schema.`,
			};
		}

		// Retrieve all keys (schema paths) from the model's schema
		const keys = Object.keys(model.schema.paths);

		// Filter out internal keys such as __v and _id if needed
		const filteredKeys: string[] = keys.filter(key => key !== '__v' && key !== '_id');

		// Get the settings type options
		const types = setttingsTypeOptions;

		// Generate settings configuration for each field
		const settings: Settings = {};

		filteredKeys.forEach((key: string) => {
			const schemaPath = model.schema.paths[key];

			// Get the field type and handle different mongoose types
			let fieldType = schemaPath.instance || 'string';

			// Map mongoose types to our settings types
			const typeMapping: { [key: string]: string } = {
				String: 'string',
				Number: 'number',
				Date: 'date',
				Boolean: 'boolean',
				Array: 'array',
				ObjectId: 'string',
				Mixed: 'object',
				Decimal128: 'number',
				Map: 'object',
			};

			const mappedType = typeMapping[fieldType] || 'string';

			// Check if it's an array type
			if (schemaPath.schema && schemaPath.schema.paths) {
				// This is likely an array of objects
				fieldType = 'array-object';
			} else if (fieldType === 'Array') {
				// Determine if it's array of strings, numbers, or objects
				const arrayType = schemaPath.options?.type?.[0];
				if (arrayType === String) {
					fieldType = 'array-string';
				} else if (arrayType === Number) {
					fieldType = 'array-number';
				} else {
					fieldType = 'array';
				}
			} else {
				fieldType = mappedType;
			}

			// Create filter configuration
			const filter: Filter = {
				name: key,
				field: key,
				type: getFilterType(fieldType),
				label: formatLabel(key),
				title: `Sort by ${formatLabel(key)}`,
			};

			// Add options for enum fields
			if (schemaPath.options?.enum) {
				filter.type = 'select';
				filter.options = schemaPath.options.enum.map((value: any) => ({
					label: formatLabel(value.toString()),
					value: value.toString(),
				}));
			}

			// Build the setting configuration
			const setting: any = {
				title: formatLabel(key),
				type: fieldType as any,
				sort: false,
				search: isSearchableType(fieldType),
				unique: schemaPath.options?.unique || false,
				exclude: false,
				required: schemaPath.isRequired || false,
				trim: schemaPath.options?.trim || false,
				min: schemaPath.options?.min,
				max: schemaPath.options?.max,
				filter,
			};

			// Add populate configuration only for ObjectId references
			if (schemaPath.options?.ref) {
				setting.populate = {
					path: key,
					select: 'name title _id', // Default fields to populate
				};
			}

			settings[key] = setting;
		});

		return {
			keys: filteredKeys,
			settings,
			types,
			success: true,
			message: `Successfully generated settings for model '${modelName}' with ${filteredKeys.length} fields.`,
		};
	} catch (error: any) {
		return {
			keys: [],
			settings: {},
			types: setttingsTypeOptions,
			success: false,
			message: `Error generating model settings: ${error.message}`,
		};
	}
};

/**
 * Helper function to format field names into readable labels
 */
const formatLabel = (key: string): string => {
	return key
		.replace(/([A-Z])/g, ' $1') // Add space before capital letters
		.replace(/^./, str => str.toUpperCase()) // Capitalize first letter
		.replace(/_/g, ' ') // Replace underscores with spaces
		.trim();
};

/**
 * Helper function to determine filter type based on field type
 */
const getFilterType = (fieldType: string): Filter['type'] => {
	switch (fieldType) {
		case 'boolean':
			return 'boolean';
		case 'date':
			return 'date';
		case 'number':
			return 'range';
		case 'array':
		case 'array-string':
		case 'array-object':
			return 'multi-select';
		default:
			return 'text';
	}
};

/**
 * Helper function to determine if a field type should be searchable by default
 */
const isSearchableType = (fieldType: string): boolean => {
	const searchableTypes = ['string', 'text', 'email'];
	return searchableTypes.includes(fieldType);
};

/**
 * Async version that can handle model loading and validation
 */
export const generateModelSettingsAsync = async (
	modelName: string
): Promise<ModelSettingsResult> => {
	return new Promise(resolve => {
		try {
			const result = generateModelSettings(modelName);
			resolve(result);
		} catch (error: any) {
			resolve({
				keys: [],
				settings: {},
				types: setttingsTypeOptions,
				success: false,
				message: `Async error: ${error.message}`,
			});
		}
	});
};

export default generateModelSettings;
