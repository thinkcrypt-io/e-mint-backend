import { Response } from 'express';
import axios from 'axios';

type WhatsAppMessageRequest = {
	to: string;
	templateName?: string;
	templateLanguage?: string;
	message?: string;
	type?: 'template' | 'text';
	parameters?: any[];
};

// Common templates and their expected parameter counts
const COMMON_TEMPLATES = {
	hello_world: 0,
	sample_happy_hour_announcement: 2,
	sample_flight_confirmation: 3,
	sample_hotel_confirmation: 4,
	sample_order_confirmation: 3,
	sample_shipping_confirmation: 3,
};

const validateTemplateParameters = (templateName: string, parameters: any[]) => {
	const expectedCount = COMMON_TEMPLATES[templateName as keyof typeof COMMON_TEMPLATES];

	if (expectedCount !== undefined) {
		if (parameters.length !== expectedCount) {
			return {
				valid: false,
				message: `Template "${templateName}" expects ${expectedCount} parameters, but ${parameters.length} were provided`,
				expectedCount,
				providedCount: parameters.length,
			};
		}
	}

	return { valid: true };
};

const sendWhatsapp = async (req: any, res: Response) => {
	try {
		const {
			to,
			templateName = 'hello_world',
			templateLanguage = 'en_US',
			message,
			type = 'template',
			parameters = [],
		}: WhatsAppMessageRequest = req.body;

		// Validate required fields
		if (!to) {
			return res.status(400).json({
				success: false,
				message: 'Phone number is required',
			});
		}

		// WhatsApp API configuration
		const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0/684240418111408/messages';
		const ACCESS_TOKEN =
			process.env.WHATSAPP_ACCESS_TOKEN ||
			'EAAur1XMfJ3YBPEgsm6Bd3rH9Ffv0M0d6VAFBBQJZBVnZBZCij8zZBQW2UfJVxtNZA3Pn0xTRdWN8fJO0WH2n1DZBBKL4KZCvfj2c4dKcUn8l9ZBmvE8akI8KisUKt7p2z99sZB8EdxZBUJ81ps8pZBTMbcLGFHN8ty5FphKVD7PmPZCS4ZAxOhGePc24TNZAeZB70jvS191RZCnOreoyVe3KxZAx3ucaaZBZBcNnIRVmsJQTdyci9zd9apOmgZDZD';

		// Format phone number (ensure it has country code)
		const formattedPhone = to.startsWith('+') ? to.slice(1) : to;

		let messageData: any = {
			messaging_product: 'whatsapp',
			to: formattedPhone,
		};

		// Build message based on type
		if (type === 'template') {
			// Validate template parameters before sending
			const validation = validateTemplateParameters(templateName, parameters);
			if (!validation.valid) {
				return res.status(400).json({
					success: false,
					message: validation.message,
					expectedParameters: validation.expectedCount,
					providedParameters: validation.providedCount,
					suggestion: `Adjust the parameters array to have exactly ${validation.expectedCount} items`,
				});
			}

			messageData.type = 'template';
			messageData.template = {
				name: templateName,
				language: {
					code: templateLanguage,
				},
			};

			// Add parameters if provided
			if (parameters && parameters.length > 0) {
				messageData.template.components = [
					{
						type: 'body',
						parameters: parameters.map(param => ({
							type: 'text',
							text: param,
						})),
					},
				];
			}
		} else if (type === 'text') {
			if (!message) {
				return res.status(400).json({
					success: false,
					message: 'Message text is required for text type',
				});
			}
			messageData.type = 'text';
			messageData.text = {
				body: message,
			};
		}

		// Send message to WhatsApp API
		const response = await axios.post(WHATSAPP_API_URL, messageData, {
			headers: {
				Authorization: `Bearer ${ACCESS_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		// Log successful message
		console.log('WhatsApp message sent successfully:', {
			to: formattedPhone,
			messageId: response.data.messages?.[0]?.id,
			timestamp: new Date().toISOString(),
		});

		return res.status(200).json({
			success: true,
			message: 'WhatsApp message sent successfully',
			data: {
				messageId: response.data.messages?.[0]?.id,
				to: formattedPhone,
				status: 'sent',
			},
		});
	} catch (e: any) {
		console.error('WhatsApp API Error:', {
			message: e.message,
			response: e.response?.data,
			status: e.response?.status,
		});

		// Handle specific WhatsApp API errors
		if (e.response?.status === 401) {
			return res.status(401).json({
				success: false,
				message: 'Invalid WhatsApp access token',
			});
		}

		if (e.response?.status === 400) {
			const errorMessage = e.response?.data?.error?.message;
			const errorDetails = e.response?.data?.error?.error_data?.details;

			if (errorMessage?.includes('Number of parameters does not match')) {
				// Extract expected parameter count from error details if available
				let expectedParams = 'unknown';
				if (errorDetails) {
					const match = errorDetails.match(/expects (\d+) parameters/);
					if (match) {
						expectedParams = match[1];
					}
				}

				return res.status(400).json({
					success: false,
					message: `Parameter count mismatch for template "${req.body.templateName || 'hello_world'}"`,
					details: errorMessage,
					error_details: errorDetails,
					suggestion:
						'Check your template in Meta Business Manager to see how many parameters it expects',
					providedParameters: req.body.parameters?.length || 0,
					expectedParameters: expectedParams,
					fix: `If using template "${req.body.templateName || 'hello_world'}", make sure to provide exactly ${expectedParams} parameters in the request body`,
				});
			}

			// Check for other common WhatsApp API errors
			if (errorMessage?.includes('Message template does not exist')) {
				return res.status(400).json({
					success: false,
					message: `Template "${req.body.templateName || 'hello_world'}" does not exist`,
					suggestion: 'Create the template in Meta Business Manager or use an existing template',
					details: errorMessage,
				});
			}

			if (errorMessage?.includes('Invalid phone number')) {
				return res.status(400).json({
					success: false,
					message: 'Invalid phone number format',
					suggestion: 'Use format: +1234567890 (include country code)',
					providedNumber: req.body.to,
					details: errorMessage,
				});
			}

			return res.status(400).json({
				success: false,
				message: errorMessage || 'Invalid request to WhatsApp API',
				raw_error: e.response?.data,
			});
		}

		if (e.response?.status === 404) {
			const errorMessage = e.response?.data?.error?.message;
			if (errorMessage?.includes('Template name does not exist')) {
				return res.status(404).json({
					success: false,
					message: `Template "Name" does not exist in your WhatsApp Business account`,
					suggestion:
						'Please create the template in Meta Business Manager or use an existing template name',
					availableTemplates: ['Use Meta Business Manager to view your templates'],
				});
			}
			return res.status(404).json({
				success: false,
				message: errorMessage || 'WhatsApp API endpoint not found',
			});
		}

		return res.status(500).json({
			success: false,
			message: 'Failed to send WhatsApp message',
			error: e.message,
		});
	}
};

export default sendWhatsapp;
