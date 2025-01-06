import { getErrorMessage } from '../../../imports.js';

const checkBalance = async (req: any, res: any) => {
	try {
		const apiKey: string = process.env.SMS_API_KEY || '';
		const url: string = `http://bulksmsbd.net/api/getBalanceApi?api_key=${apiKey}`;

		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});

		if (!response.ok) {
			const errorData = await response.json(); // Convert response to JSON
			console.log('Error sending SMS:', errorData.message); // Log the error message
			return { success: false, data: errorData.message };
		}

		const responseData: any = await response.json();

		if (responseData.response_code !== 202) {
			return res.status(400).json({ message: responseData.error_message });
		}

		return res.status(200).json(responseData);
	} catch (e: any) {
		const message = getErrorMessage(e);
		console.log(e);
		return res.status(500).json({ message });
	}
};

export default checkBalance;
