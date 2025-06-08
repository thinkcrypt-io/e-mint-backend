import Counter from '../../models/counter/counter.model.js';

interface CounterOptions {
	slug: string;
	prefix: string;
	initialValue?: number;
	padding?: number;
}

/**
 * Generates a sequential code with auto-incrementing counter
 * @param options - Configuration options for the counter
 * @returns Promise<string> - The generated sequential code
 */
export async function generateSequentialCode(options: CounterOptions): Promise<string> {
	try {
		const { slug, prefix, initialValue = 1, padding = 4 } = options;

		let counter = await Counter.findOne({ slug });
		if (!counter) {
			counter = new Counter({
				sequenceValue: initialValue,
				slug,
			});
		}

		counter.sequenceValue += 1;
		await counter.save();

		return `${prefix.toUpperCase()}-${counter.sequenceValue.toString().padStart(padding, '0')}`;
	} catch (error) {
		console.error('Error generating sequential code:', error);
		throw error;
	}
}

/**
 * Middleware function to auto-generate sequential codes for new documents
 * @param options - Configuration options for the counter
 * @returns Pre-save middleware function
 */
export function addSequentialCodeMiddleware(options: CounterOptions) {
	return async function (this: any, next: any) {
		try {
			if (this.isNew) {
				this.code = await generateSequentialCode(options);
			}
			next();
		} catch (error: any) {
			console.log(error);
			next(error);
		}
	};
}
