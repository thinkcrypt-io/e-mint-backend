import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		position: {
			type: String,
			required: true,
			trim: true,
		},
		bio: {
			type: String, // Short bio or description about the member
		},
		profilePicture: {
			type: String, // URL of the profile image
			trim: true,
			required: true,
		},
		skills: {
			type: [String], // Example: ["MERN Stack", "UI/UX", "Project Management"]
		},
		experienceInYears: Number,
		// socialLinks: {
		// 	linkedin: String,
		// 	github: String,
		// 	twitter: String,
		// 	personalWebsite: String,
		// },
		priority: {
			type: Number,
			required: true,
			default: 1,
		},
		email: {
			type: String,
			trim: true,
		},
		phone: {
			type: String,
			trim: true,
		},
		status: {
			type: String,
			enum: ['active', 'former'], // Current team member or past member
			default: 'Active',
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true,
	}
);

const TeamMember = mongoose.model<any>('TeamMember', schema);
export default TeamMember;
