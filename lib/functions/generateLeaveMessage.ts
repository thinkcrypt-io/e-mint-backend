type MessageType = {
	name: string;
	status?: string;
	reason?: string;
	trackingId: string;
};

const generateLeaveMessage = ({
	name,
	status = 'pending',
	reason,
	trackingId,
}: MessageType): string => {
	let message: string = '';
	if (status == 'pending') {
		message = `Hello ${name},\n\n
Your leave request has been submitted successfully. You will be notified once it is approved.\n
Your Tracking ID is: ${trackingId}\n
Thank you.\n\n`;
	} else if (status == 'rejected') {
		message = `**THIS IS A SYSTEM GENERATED MESSAGE**\n\n
Hello ${name},\n
Your leave request has been automatically rejected by the system.\n
Your Tracking ID is: ${trackingId}\n
Cause of Rejection:\n${reason}\n
Thank you.`;
	}

	return message;
};

export default generateLeaveMessage;
