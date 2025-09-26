type SMSData = {
	receiver: string;
	message: string;
};

type ReturnData = {
	success: boolean;
	data: any;
};
const sendSMS = async ({ receiver, message }: SMSData): Promise<ReturnData> => {
	try {
		const url: string = 'http://bulksmsbd.net/api/smsapi';
		const apiKey: string = process.env.SMS_API_KEY || '';
		const senderId: string = process.env.SMS_SENDER_ID || '';
		const number: string = receiver;

		// const data: URLSearchParams = new URLSearchParams();
		// data.append('api_key', apiKey);
		// data.append('senderid', senderId);
		// data.append('number', number);
		// data.append('message', message);

		const data = new URLSearchParams({
			api_key: apiKey,
			senderid: senderId,
			number: number,
			message: message,
		});

		const response = await fetch(url, {
			method: 'POST',
			body: data,
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
			// Check if the response code is not 202
			console.log('SMS sent successfully:', responseData);
			console.log('Error Code', responseData.response_code); // Log the error code
			console.log('Error sending SMS:', responseData.error_message);
			return { success: false, data: responseData.error_message };
		}

		return { success: true, data: responseData };
	} catch (e: any) {
		console.log('Error sending SMS:', e.message);
		return { success: false, data: e.message };
	}
};

export default sendSMS;
