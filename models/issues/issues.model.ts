import mongoose, { Schema } from 'mongoose';
import Admin from '../admin/admin.model.js';
import sendMail from '../../controllers/mail/sendMail.controller.js';
import Counter from '../counter/counter.model.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,
			trim: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},

		description: {
			type: String,
			required: true,
			trim: true,
		},
		status: {
			type: String,
			enum: [
				'open',
				'in-progress',
				'on-hold',
				'testing',
				'resolved',
				'closed',
				'pending',
				'review',
				'reopened',
				'invalid',
				'needs-discussion',
			],
			default: 'open',
		},
		images: [String],
		priority: {
			type: String,
			enum: ['low', 'medium', 'high', 'critical'],
			required: true,
		},
		type: {
			type: String,
			enum: ['bug', 'feature-request', 'improvement', 'task', 'research', 'duplicate'],
			required: true,
		},
		project: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Software',
			required: true,
		},
		assignedTo: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Admin',
		},
		addedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Admin',
		},
		note: String,
		dueDate: Date,
		isActive: {
			type: Boolean,
			default: true,
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
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'issue' });
			if (!counter) counter = new Counter({ sequenceValue: 1, slug: 'issue' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `TSK-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

// Pre-save hook to auto-increment the invoice number
schema.post<any>('save', async function (next) {
	try {
		if (isNewItem) {
			if (!this.assignedTo) return;
			else {
				const getAssignee: any = await Admin.findById(this.assignedTo);
				sendMail({
					title: 'THINKERP | TASKS',
					to: getAssignee.email,
					subject: `New Issue Assigned #${this.code}`,
					body: `A new issue has been assigned to you. Please check your dashboard for more details. \n\nISSUE ID: ${this.code} \n\nTitle: ${this.name} \n\nDescription: ${this.description} \n\nPriority: ${this.priority} \n\nType: ${this.type} \n\nDue Date: ${this.dueDate} \n`,
				});
			}
		}
	} catch (error: any) {
		console.log('Error with issue:', error);
	}
});

const Issue = mongoose.model<any>('Issue', schema);
export default Issue;
