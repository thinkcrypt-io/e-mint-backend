import { Document, Schema, Types } from 'mongoose';

type Status =
	| 'draft'
	| 'pending'
	| 'completed'
	| 'cancelled'
	| 'scheduled'
	| 'in-progress'
	| 'rescheduled'
	| 'postponed'
	| 'archived';
type MeetingsType = 'in-person' | 'virtual' | 'hybrid';

type DocumentBaseType = {
	createdAt?: Date;
	updatedAt?: Date;
};

type MeetingType = DocumentBaseType & {
	//Basic Details
	name: String;
	agenda?: String;
	description?: String;
	priority?: 'high' | 'medium' | 'low';
	tags?: [String];

	//client/project/lead
	client?: Types.ObjectId;
	project?: Types.ObjectId;
	lead?: Types.ObjectId;

	//host
	host?: Types.ObjectId;
	invitees?: [String];

	//Time & Date
	date?: Date;
	scheduledTime?: String;
	duration?: String;
	startTime?: String;
	endTime?: String;

	//External Integration
	externalCalendarId?: String;

	//Meeting Status
	status: Status;
	rescheduleReason?: String;
	cancelReason?: String;

	//type of meeting
	meetingType: MeetingsType;

	//if In-Person Meeting
	location?: String;
	map?: String;

	//if Virtual Meeting
	platform?: String;
	meetingUrl?: String;
	meetingId?: String;
	meetingPassword?: String;

	//For Later Use
	note?: String;
	participants?: [String];

	// Attachments and recording details
	file: String;
	fileUrl?: String;
	recordingUrl: { type: String };

	//access
	addedBy: Types.ObjectId;
	access: [Types.ObjectId];

	//Created At
	createdAt?: Date;
	updatedAt?: Date;
};

export default MeetingType;
