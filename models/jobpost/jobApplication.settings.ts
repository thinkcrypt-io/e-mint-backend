import { table } from 'console';
import { SettingsType } from '../../lib/types/settings.types';
import JobApplicationType from './jobApplication.types';

const educationLevelOptions = [
	{ label: 'High School', value: 'high-school' },
	{ label: 'Diploma', value: 'diploma' },
	{ label: 'Bachelors', value: 'bachelors' },
	{ label: 'Masters', value: 'masters' },
	{ label: 'PhD', value: 'phd' },
	{ label: 'Other', value: 'other' },
];

const experienceLevelOptions = [
	{ label: 'Entry Level', value: 'entry-level' },
	{ label: 'Mid Level', value: 'mid-level' },
	{ label: 'Senior Level', value: 'senior-level' },
	{ label: 'Management', value: 'management' },
	{ label: 'Other', value: 'other' },
];

const applicationStatusOptions = [
	{ label: 'Applied', value: 'applied' },
	{ label: 'Pending', value: 'pending' },
	{ label: 'Reviewed', value: 'reviewed' },
	{ label: 'Shortlisted', value: 'shortlisted' },
	{ label: 'Called', value: 'called' },
	{ label: 'Interview Scheduled', value: 'interview-scheduled' },
	{ label: 'Interviewed', value: 'interviewed' },
	{ label: 'Offer Sent', value: 'offer-sent' },
	{ label: 'Offer Accepted', value: 'offer-accepted' },
	{ label: 'Offer Declined', value: 'offer-declined' },
	{ label: 'Recalled', value: 'recalled' },
	{ label: 'Rejected', value: 'rejected' },
	{ label: 'Hired', value: 'hired' },
	{ label: 'Deleted', value: 'deleted' },
	{ label: 'Expired', value: 'expired' },
];

const appliedFromOptions = [
	{ label: 'LinkedIn', value: 'linkedin' },
	{ label: 'Email', value: 'email' },
	{ label: 'Facebook', value: 'facebook' },
	{ label: 'Application URL', value: 'applicationUrl' },
	{ label: 'Referral', value: 'referral' },
	{ label: 'Other', value: 'other' },
];

const settings: SettingsType<JobApplicationType> = {
	jobPost: {
		edit: true,
		title: 'Job Post',
		type: 'string',
		required: true,
		populate: {
			path: 'jobPost',
			select: 'name',
		},
		schema: {
			type: 'data-menu',
			model: 'jobposts',
			tableType: 'text',
			displayInTable: true,
			default: true,
		},
	},
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Name',
		type: 'string',
		required: true,
		schema: {
			sort: true,
			default: true,
			displayInTable: true,
		},
	},
	email: {
		edit: true,
		search: true,
		title: 'Email',
		type: 'email',
		// required: true,
		schema: {
			type: 'string',
			displayInTable: true,
			default: true,
		},
	},
	phone: {
		edit: true,
		search: true,
		title: 'Phone',
		type: 'string',
		schema: {
			displayInTable: true,
		},
	},
	address: {
		edit: true,
		search: true,
		title: 'Address',
		type: 'string',
	},
	city: {
		edit: true,
		search: true,
		title: 'City',
		type: 'string',
		sort: true,
		filter: {
			name: 'city',
			field: 'city_in',
			type: 'multi-select',
			label: 'City',
			title: 'Filter by city',
			category: 'distinct',
			key: 'city',
		},
	},
	coverLetter: {
		edit: true,
		title: 'Cover Letter',
		type: 'string',
		schema: {
			type: 'textarea',
		},
	},
	resume: {
		edit: true,
		title: 'Resume',
		type: 'uri',
		schema: {
			type: 'file',
			displayInTable: true,
		},
	},
	resumeUrl: {
		edit: true,
		title: 'Resume URL',
		type: 'uri',
		schema: {
			type: 'string',
			tableType: 'external-link',
			viewType: 'external-link',
			displayInTable: true,
		},
	},
	educationLevel: {
		edit: true,
		title: 'Education Level',
		type: 'string',
		schema: {
			type: 'select',
			options: educationLevelOptions,
		},
	},
	school: {
		edit: true,
		search: true,
		title: 'School',
		type: 'string',
	},
	college: {
		edit: true,
		search: true,
		title: 'College',
		type: 'string',
	},
	degree: {
		edit: true,
		search: true,
		title: 'Degree',
		type: 'string',
	},
	university: {
		edit: true,
		search: true,
		title: 'University',
		type: 'string',
	},
	passingYear: {
		edit: true,
		title: 'Passing Year',
		type: 'string',
	},
	portfolioUrl: {
		edit: true,
		title: 'Portfolio URL',
		type: 'uri',
		schema: {
			type: 'string',
			viewType: 'external-link',
			tableType: 'external-link',
			copy: true,
			displayInTable: true,
		},
	},
	linkedin: {
		edit: true,
		title: 'LinkedIn',
		type: 'uri',
		schema: {
			type: 'string',
			tableType: 'external-link',
			viewType: 'external-link',
		},
	},
	github: {
		edit: true,
		title: 'GitHub',
		type: 'uri',
		schema: {
			type: 'string',
			tableType: 'external-link',
			viewType: 'external-link',
		},
	},
	facebook: {
		edit: true,
		title: 'Facebook',
		type: 'uri',
		schema: {
			type: 'string',
			tableType: 'external-link',
			viewType: 'external-link',
		},
	},
	website: {
		edit: true,
		title: 'Website',
		type: 'uri',
		schema: {
			type: 'string',
			tableType: 'external-link',
			viewType: 'external-link',
		},
	},
	expectedSalary: {
		edit: true,
		sort: true,
		title: 'Expected Salary',
		type: 'number',
	},
	status: {
		edit: true,
		sort: true,
		title: 'Status',
		type: 'string',
		required: true,

		schema: {
			type: 'select',
			options: applicationStatusOptions,
			displayInTable: true,
		},
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by status',
			category: 'distinct',
			key: 'status',
		},
	},
	appliedAt: {
		edit: true,
		sort: true,
		title: 'Applied At',
		type: 'string',

		schema: {
			type: 'date',
			displayInTable: true,
			sort: true,
		},
	},
	appliedFrom: {
		edit: true,
		title: 'Applied From',
		type: 'string',
		required: true,
		schema: {
			type: 'select',
			options: appliedFromOptions,
		},
		filter: {
			name: 'appliedFrom',
			field: 'appliedFrom_in',
			type: 'multi-select',
			label: 'Applied From',
			title: 'Filter by application source',
			category: 'distinct',
			key: 'appliedFrom',
		},
	},
	experienceLevel: {
		edit: true,
		title: 'Experience Level',
		type: 'string',
		schema: {
			type: 'select',
			options: experienceLevelOptions,
		},
		filter: {
			name: 'experienceLevel',
			field: 'experienceLevel_in',
			type: 'multi-select',
			label: 'Experience Level',
			title: 'Filter by experience level',
			category: 'distinct',
			key: 'experienceLevel',
		},
	},
	skills: {
		edit: true,
		title: 'Skills',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	notes: {
		edit: true,
		title: 'Note',
		type: 'string',
		schema: {
			type: 'textarea',
		},
	},
	tags: {
		edit: true,
		title: 'Tags',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	fit: {
		edit: true,
		sort: true,
		title: 'Fit',
		type: 'string',
	},
};

export default settings;
