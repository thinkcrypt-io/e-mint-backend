/**
 * Generates a URL-friendly slug from a given text
 * @param text - The text to convert to a slug
 * @param options - Configuration options for slug generation
 * @returns A URL-friendly slug string
 */
interface SlugOptions {
	lowercase?: boolean;
	removeSpecialChars?: boolean;
	maxLength?: number;
	separator?: string;
}

export function generateSlug(text: string, options: SlugOptions = {}): string {
	const { lowercase = true, removeSpecialChars = true, maxLength = 100, separator = '-' } = options;

	if (!text) {
		return '';
	}

	let slug = text.trim();

	// Convert to lowercase if specified
	if (lowercase) {
		slug = slug.toLowerCase();
	}

	// Remove or replace special characters
	if (removeSpecialChars) {
		// Remove non-alphanumeric characters except spaces and hyphens
		slug = slug.replace(/[^a-z0-9\s-]/gi, '');
	}

	// Replace multiple spaces with single separator
	slug = slug.replace(/\s+/g, separator);

	// Replace multiple separators with single separator
	slug = slug.replace(new RegExp(`${separator}+`, 'g'), separator);

	// Remove separator from start and end
	slug = slug.replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');

	// Limit length if specified
	if (maxLength && slug.length > maxLength) {
		slug = slug.substring(0, maxLength);
		// Ensure we don't end with a separator after truncation
		slug = slug.replace(new RegExp(`${separator}+$`, 'g'), '');
	}

	return slug;
}

/**
 * Middleware function to auto-generate slugs for documents
 * @param fieldName - The field name to use as source for slug generation (default: 'name')
 * @param slugField - The field name where the slug will be stored (default: 'slug')
 * @param options - Slug generation options
 * @returns Pre-save middleware function
 */
export function addSlugMiddleware(
	fieldName: string = 'name',
	slugField: string = 'slug',
	options: SlugOptions = {}
) {
	return function (this: any, next: any) {
		try {
			// Only generate slug if it doesn't exist and the source field exists
			if (!this[slugField] && this[fieldName]) {
				this[slugField] = generateSlug(this[fieldName], options);
			}
			next();
		} catch (error: any) {
			console.log('Error generating slug:', error);
			next(error);
		}
	};
}
