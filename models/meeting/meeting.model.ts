import mongoose, { Document, Schema, Types } from 'mongoose';
import MeetingType from './meeting.types.js';
import { REGEX } from '../../imports.js';

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

const MinutesSchema = new Schema<MeetingType>(
	{
		//Basic Details
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
		meetingUrl: { type: String, match: REGEX.URL },
		meetingId: { type: String },
		meetingPassword: { type: String },

		//For Later Use
		note: { type: String },
		participants: [{ type: String }],

		// Attachments and recording details
		file: { type: String },
		fileUrl: { type: String, match: REGEX.URL },
		recordingUrl: { type: String, match: REGEX.URL },

		//access
		addedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
		access: [{ type: Schema.Types.ObjectId, ref: 'Admin' }],
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

export const Meeting = mongoose.model<MeetingType>('Meeting', MinutesSchema);
export default Meeting;
