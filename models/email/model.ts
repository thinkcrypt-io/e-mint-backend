import mongoose from 'mongoose';
import sendMail from '../../library/controllers/marketing/mail/sendMail.controller.js';

const schema = new mongoose.Schema(
	{
		title: {
			type: String,
			trim: true,
		},
		subject: {
			type: String,
			trim: true,
			required: true,
		},

		recipients: { type: mongoose.Schema.Types.Mixed },
		to: [String],
		cc: [String],
		bcc: [String],

		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Admin',
		},
		attachment: String,

		body: {
			type: String,
		},
	},

	{
		timestamps: true,
	}
);

let isNewItem = false;

schema.pre<any>('save', function (next) {
	isNewItem = this.isNew;
	next();
});

// Pre-save hook to auto-increment the invoice number
schema.post<any>('save', async function (next) {
	try {
		if (isNewItem) {
			if (this.to.length == 0) {
				if (this.cc.length == 0) {
					if (this.bcc.length == 0) {
						return;
					}
				}
			}

			const emails: any = this.to.map((assignee: any) => assignee).join(', ');

			const title = this.title?.trim() || 'Thinkcrypt.io | We Build Digital Experience';
			sendMail({
				title: title,
				to: emails,
				cc: this.cc.map((assignee: any) => assignee).join(', '),
				bcc: this.bcc.map((assignee: any) => assignee).join(', '),
				subject: this.subject,
				body: this.body,
				attachment: this.attachment,
			});
		}
	} catch (error: any) {
		console.log('Error with issue:', error);
	}
});

const Email = mongoose.model('Email', schema);
export default Email;
