import mongoose, { Schema } from 'mongoose';
import MeetingType from './meeting.types.js';
import { Admin, Counter, REGEX } from '../../imports.js';
import { ACCESS_CONTROL } from '../../lib/index.js';
import sendMail from '../../library/controllers/marketing/mail/sendMail.controller.js';

const statusEmun = [
	'draft',
	'pending',
	'completed',
	'cancelled',
	'scheduled',
	'in-progress',
	'rescheduled',
	'postponed',
	'archived',
];

const MinutesSchema = new Schema<any>(
	{
		//Basic Details
		code: {
			type: String,
			trim: true,
		},
		name: { type: String, required: true, trim: true },
		agenda: { type: String, trim: true },
		description: { type: String },
		priority: { type: String, enum: ['high', 'medium', 'low'] },
		tags: [String],

		//client/project/lead
		client: { type: Schema.Types.ObjectId, ref: 'Client' },
		project: { type: Schema.Types.ObjectId, ref: 'Software' },
		lead: { type: Schema.Types.ObjectId, ref: 'Lead' },

		//host
		host: { type: Schema.Types.ObjectId, ref: 'Admin' },
		invitees: [{ type: String, lowercase: true }],

		//Time & Date
		date: { type: Date },
		scheduledTime: { type: String },
		duration: { type: String },
		startTime: { type: String },
		endTime: { type: String },

		//External Integration
		externalCalendarId: { type: String },

		//Meeting Status
		status: {
			type: String,
			enum: statusEmun,
			required: true,
		},

		rescheduleReason: { type: String },
		cancelReason: { type: String },

		//type of meeting
		meetingType: {
			type: String,
			enum: ['in-person', 'virtual', 'hybrid'],
			required: true,
		},

		//if In-Person Meeting
		location: { type: String },
		map: { type: String },

		//if Virtual Meeting
		platform: { type: String },
		meetingUrl: { type: String },
		meetingId: { type: String },
		meetingPassword: { type: String },

		//For Later Use
		note: { type: String },
		participants: [{ type: String }],

		// Attachments and recording details
		file: { type: String },
		fileUrl: { type: String },
		recordingUrl: { type: String },

		//access
		// addedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
		// access: [{ type: Schema.Types.ObjectId, ref: 'Admin' }],
		...ACCESS_CONTROL.SCHEMA,
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

let isNewItem = false;

MinutesSchema.pre<any>('save', function (next) {
	isNewItem = this.isNew;
	next();
});

// Pre-save hook to auto-increment the invoice number
MinutesSchema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'meeting' });
			if (!counter) counter = new Counter({ sequenceValue: 50, slug: 'meeting' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `MTG-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

// Pre-save hook to auto-increment the invoice number
MinutesSchema.post<any>('save', async function (next) {
	try {
		if (isNewItem) {
			// Multiple assignees
			const getAssignees = await Admin.find({
				_id: { $in: this.access },
			});
			if (getAssignees.length > 0) {
				const emails: any = getAssignees.map((assignee: any) => assignee.email).join(', ');
				sendMail({
					title: 'THINKERP | MEETING',
					to: emails,
					subject: `You have been invited to a new meeting #${this.code}`,
					body: `You have been invited to a new meeting. \n\nMeeting ID: ${this.code} \n\nTitle: ${this.name} \n\nAgenda: ${this.agenda} \n\nMeeting Date: ${this.date} \n\nMeeting Time: ${this.scheduledTime} \n\nMeeting Type: ${this.meetingType} \n\nMeeting Location: ${this.meetingType == 'virtual' ? this.meetingUrl : this.location} \n`,
				});
			}
		}
	} catch (error: any) {
		console.log('Error with issue:', error);
	}
});

export const Meeting = mongoose.model<any>('Meeting', MinutesSchema);
export default Meeting;
