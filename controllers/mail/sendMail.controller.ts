import nodemailer from 'nodemailer';

type SendMailProps = {
	to: string;
	subject: string;
	body: string;
	title?: string;
	cc?: string;
	bcc?: string;
	attachment?: string;
};

const sendMail = async ({ to, subject, body, title, cc, bcc, attachment }: SendMailProps) => {
	try {
		var transporter = nodemailer.createTransport({
			host: process.env.MAIL_HOST,
			port: 587,
			secure: false,
			auth: {
				user: process.env.MAIL_ADDRESS,
				pass: process.env.MAIL_PASSWORD,
			},
		});

		const mailOptions: any = {
			from: `${title || 'MINT'} <${process.env.MAIL_ADDRESS}>`,
			to: to,
			...(cc && { cc: cc }),
			...(bcc && { bcc: bcc }),
			subject: subject,
			text: body,
			...(attachment && { attachments: [{ fileName: 'Attachment', path: attachment }] }),
		};

		console.log('Mail Options:', mailOptions);

		transporter.sendMail(mailOptions, function (error, info) {
			if (error) {
				console.log('Error Sending Mail' + error);
			} else {
				console.log('Email sent: to email' + to + ': Resposnse:' + info.response);
			}
		});
	} catch (e) {
		console.log('Error Sending Mail');
	}
};

export default sendMail;
