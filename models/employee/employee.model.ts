import mongoose, { Schema, model, Document, Types } from 'mongoose';
import LeaveType from './leave.types.js';
import Counter from '../counter/counter.model.js';
import { ACCESS_CONTROL } from '../../imports.js';

const schema = new Schema<any>(
	{
		code: {
			type: String,
			trim: true,
			unique: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		email: {
			type: String,
			trim: true,
			required: true,
		},
		phone: {
			type: String,
			trim: true,
		},
		whatsApp: {
			type: String,
			trim: true,
		},
		github: String,
		discord: String,
		gender: {
			type: String,
			enum: ['male', 'female', 'other'],
		},
		dob: Date,
		presentAddress: String,
		permanentAddress: String,
		university: String,
		degree: String,
		passingYear: String,
		nid: String,
		bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
		nidAttachment: String,
		photo: String,
		cvAttachment: String,
		joiningDate: Date,
		jobTitle: String,
		department: String,
		salary: Number,
		//Bank details
		bankAccount: String,
		bankAccountName: String,
		bankRoutingNumber: String,
		bankName: String,
		branchName: String,
		documents: [String],
		experience: [
			{
				company: String,
				position: String,
				startDate: Date,
				endDate: Date,
				responsibilities: [String],
			},
		],
		contractDoc: String,
		education: [
			{
				degree: String,
				institution: String,
				field: String,
				year: Number,
				grade: String,
			},
		],

		//bKash details
		bKash: String,
		status: {
			type: String,

			enum: ['present', 'former'],
			default: 'present',
		},
		emergencyContactName: String,
		emergencyContactRelationship: String,
		emergencyContactNumber: String,
		maritalStatus: String,
		employeeType: {
			type: String,
			enum: ['full-time', 'part-time', 'contractual', 'intern', 'other'],
		},
		contractEndDate: Date,
		terminationDate: Date,
		adminId: {
			type: Schema.Types.ObjectId,
			red: 'Admin',
		},
		linkedIn: String,
		skills: [String],
		foodSubsidy: String,
		salaryDisburstmentPreference: {
			type: String,
			enum: ['bank', 'bKash', 'cash'],
		},
		nationality: String,
		reportingTo: {
			type: Schema.Types.ObjectId,
			ref: 'Admin',
		},

		...ACCESS_CONTROL.SCHEMA,
	},
	{
		timestamps: true, // Automatically creates and manages createdAt and updatedAt
	}
);

let isNew = false;

schema.pre<any>('save', function (next) {
	isNew = this.isNew;
	next();
});

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'employee' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'employee' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `TC-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Leave = mongoose.model<any>('Employee', schema);

export default Leave;
