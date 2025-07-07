import { Response } from 'express';

// Common templates and their expected parameter counts
const COMMON_TEMPLATES = {
	hello_world: 0,
	sample_happy_hour_announcement: 2,
	sample_flight_confirmation: 3,
	sample_hotel_confirmation: 4,
	sample_order_confirmation: 3,
	sample_shipping_confirmation: 3,
};

const validateWhatsappTemplate = async (req: any, res: Response) => {
	try {
		const { templateName, parameters = [] } = req.body;

		if (!templateName) {
			return res.status(400).json({
				success: false,
				message: 'Template name is required',
			});
		}

		const expectedCount = COMMON_TEMPLATES[templateName as keyof typeof COMMON_TEMPLATES];

		if (expectedCount === undefined) {
			return res.status(200).json({
				success: true,
				message: 'Template not in common templates list',
				templateName,
				suggestion: 'Check Meta Business Manager for exact parameter requirements',
				providedParameters: parameters.length,
				knownTemplates: Object.keys(COMMON_TEMPLATES),
			});
		}

		const isValid = parameters.length === expectedCount;

		return res.status(200).json({
			success: true,
			templateName,
			isValid,
			expectedParameters: expectedCount,
			providedParameters: parameters.length,
			message: isValid
				? 'Template parameters are valid'
				: `Template "${templateName}" expects ${expectedCount} parameters, but ${parameters.length} were provided`,
			suggestion: isValid
				? 'Ready to send'
				: `Adjust parameters array to have exactly ${expectedCount} items`,
		});
	} catch (error: any) {
		console.error('Template validation error:', error);
		return res.status(500).json({
			success: false,
			message: 'Failed to validate template',
			error: error.message,
		});
	}
};

export default validateWhatsappTemplate;
