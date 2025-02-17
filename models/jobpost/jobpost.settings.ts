import { SettingsType } from '../../lib/types/settings.types';
import JobPostType from './jobpost.types.js';

const experienceLevelOptions = [
	{ label: 'Entry Level', value: 'entry-level' },
	{ label: 'Mid Level', value: 'mid-level' },
	{ label: 'Senior Level', value: 'senior-level' },
	{ label: 'Management', value: 'management' },
	{ label: 'Other', value: 'other' },
];

const educationLevelOptions = [
	{ label: 'High School', value: 'high-school' },
	{ label: 'Diploma', value: 'diploma' },
	{ label: 'Bachelors', value: 'bachelors' },
	{ label: 'Masters', value: 'masters' },
	{ label: 'PhD', value: 'phd' },
	{ label: 'Other', value: 'other' },
];

const shiftOptions = [
	{ label: 'Morning', value: 'morning' },
	{ label: 'Evening', value: 'evening' },
	{ label: 'Night', value: 'night' },
	{ label: 'Rotational', value: 'rotational' },
	{ label: 'Other', value: 'other' },
];

const employmentTypeOptions = [
	{ label: 'Full Time', value: 'full-time' },
	{ label: 'Part Time', value: 'part-time' },
	{ label: 'Contract', value: 'contract' },
	{ label: 'Internship', value: 'internship' },
	{ label: 'Temporary', value: 'temporary' },
	{ label: 'Freelance', value: 'freelance' },
	{ label: 'Other', value: 'other' },
];

const jobLocationTypeOptions = [
	{ label: 'Remote', value: 'remote' },
	{ label: 'Onsite', value: 'onsite' },
	{ label: 'Hybrid', value: 'hybrid' },
];

const salaryTypeOptions = [
	{ label: 'Hourly', value: 'hourly' },
	{ label: 'Weekly', value: 'weekly' },
	{ label: 'Monthly', value: 'monthly' },
	{ label: 'Yearly', value: 'yearly' },
];

const statusOptions = [
	{ label: 'Draft', value: 'draft' },
	{ label: 'Published', value: 'published' },
	{ label: 'Open', value: 'open' },
	{ label: 'Paused', value: 'paused' },
	{ label: 'Completed', value: 'completed' },
	{ label: 'Closed', value: 'closed' },
	{ label: 'Archived', value: 'archived' },
	{ label: 'Deleted', value: 'deleted' },
	{ label: 'Expired', value: 'expired' },
];

const settings: SettingsType<JobPostType> = {
	name: {
		edit: true,
		sort: true,
		search: true,
		title: 'Job Title',
		type: 'string',
		required: true,
		trim: true,
		schema: {
			default: true,
			displayInTable: true,
			sort: true,
		},
	},
	company: {
		edit: true,
		sort: true,
		search: true,
		title: 'Company',
		type: 'string',
		required: true,
		schema: {
			default: true,
			displayInTable: true,
			sort: true,
		},
	},
	email: {
		edit: true,
		search: true,
		title: 'Email',
		type: 'email',
		schema: {
			displayInTable: true,
			type: 'string',
		},
	},
	category: {
		edit: true,
		search: true,
		title: 'Job Category',
		type: 'string',
		schema: {
			displayInTable: true,
		},
	},
	postingDate: {
		edit: true,
		sort: true,
		title: 'Posting Date',
		type: 'string',

		schema: {
			displayInTable: true,
			sort: true,
			type: 'date',
		},
	},
	postingMedia: {
		edit: true,
		title: 'Posting Media',
		type: 'string',
		sort: true,
		filter: {
			name: 'postingMedia',
			field: 'postingMedia_in',
			type: 'multi-select',
			label: 'Posting Media',
			title: 'Filter by posting media',
			category: 'distinct',
			key: 'postingMedia',
		},
		schema: {
			displayInTable: true,
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
	educationLevel: {
		edit: true,
		title: 'Education Level',
		type: 'string',
		schema: {
			type: 'select',
			options: educationLevelOptions,
		},
		filter: {
			name: 'educationLevel',
			field: 'educationLevel_in',
			type: 'multi-select',
			label: 'Education Level',
			title: 'Filter by education level',
			category: 'distinct',
			key: 'educationLevel',
		},
	},
	applicationProcess: {
		edit: true,
		title: 'Application Process',
		type: 'string',
		schema: {
			type: 'textarea',
		},
	},
	shift: {
		edit: true,
		title: 'Shift',
		type: 'string',
		schema: {
			type: 'select',
			options: shiftOptions,
		},
	},
	phone: {
		edit: true,
		search: true,
		title: 'Phone',
		type: 'string',
	},
	website: {
		edit: true,
		title: 'Website',
		type: 'string',
		schema: {
			viewType: 'external-link',
		},
	},
	address: {
		edit: true,
		search: true,
		title: 'Address',
		type: 'string',
		schema: {
			type: 'textarea',
		},
	},
	city: {
		edit: true,
		search: true,
		sort: true,
		title: 'City',
		type: 'string',
		schema: {
			displayInTable: true,
		},
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
	country: {
		edit: true,
		search: true,
		title: 'Country',
		type: 'string',
		schema: {
			displayInTable: true,
			sort: true,
		},
	},
	industry: {
		edit: true,
		search: true,
		title: 'Industry',
		type: 'string',
		schema: {
			displayInTable: true,
			sort: true,
		},
	},
	companyDescription: {
		edit: true,
		title: 'Company Description',
		type: 'string',
		schema: {
			type: 'textarea',
		},
	},
	employmentType: {
		edit: true,
		title: 'Employment Type',
		type: 'string',
		required: true,
		schema: {
			type: 'select',
			options: employmentTypeOptions,
		},
		filter: {
			name: 'employmentType',
			field: 'employmentType_in',
			type: 'multi-select',
			label: 'Employment Type',
			title: 'Filter by employment type',
			category: 'distinct',
			key: 'employmentType',
		},
	},
	jobLocationType: {
		edit: true,
		title: 'Job Location Type',
		type: 'string',
		required: true,
		schema: {
			type: 'select',
			options: jobLocationTypeOptions,
		},
	},
	jobLocation: {
		edit: true,
		search: true,
		title: 'Job Location',
		type: 'string',
	},
	minSalary: {
		edit: true,
		sort: true,
		title: 'Minimum Salary',
		type: 'number',
		required: true,
	},
	maxSalary: {
		edit: true,
		sort: true,
		title: 'Maximum Salary',
		type: 'number',
		required: true,
	},
	salaryType: {
		edit: true,
		title: 'Salary Type',
		type: 'string',
		schema: {
			type: 'select',
			options: salaryTypeOptions,
		},
	},
	salaryCurrency: {
		edit: true,
		title: 'Salary Currency',
		type: 'string',
	},
	jobDescription: {
		edit: true,
		title: 'Job Description',
		type: 'string',
		schema: {
			type: 'textarea',
		},
	},
	requirements: {
		edit: true,
		title: 'Requirements',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	qualifications: {
		edit: true,
		title: 'Qualifications',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	responsibilities: {
		edit: true,
		title: 'Responsibilities',
		type: 'array-string',
		schema: {
			type: 'tag',
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
	noOfOpenings: {
		edit: true,
		title: 'Number of Openings',
		type: 'number',
	},
	applicationUrl: {
		edit: true,
		title: 'Application URL',
		type: 'string',
		schema: {
			viewType: 'external-link',
		},
	},
	companyLogo: {
		edit: true,
		title: 'Company Logo',
		type: 'string',
		schema: {
			type: 'image',
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
	benefits: {
		edit: true,
		title: 'Benefits',
		type: 'array-string',
		schema: {
			type: 'tag',
		},
	},
	addedBy: {
		edit: true,
		title: 'Added By',
		type: 'string',
		populate: {
			path: 'addedBy',
			select: 'name',
		},
		schema: {
			displayInTable: true,
			sort: true,
			tableKey: 'addedBy.name',
		},
	},
	isActive: {
		edit: true,
		type: 'boolean',
		title: 'Active Status',
		sort: true,
		schema: {
			type: 'checkbox',
			displayInTable: true,
		},
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Filter by active status',
		},
	},
	deadline: {
		edit: true,
		sort: true,
		title: 'Deadline',
		type: 'string',

		schema: {
			displayInTable: true,
			sort: true,
			type: 'date',
		},
	},
	file: {
		edit: true,
		title: 'File',
		type: 'uri',
		schema: {
			type: 'file',
		},
	},
	fileUrl: {
		edit: true,
		title: 'File Url',
		type: 'uri',
		schema: {
			type: 'string',
			viewType: 'external-link',
			copy: true,
		},
	},
	status: {
		edit: true,
		title: 'Status',
		type: 'string',
		required: true,
		schema: {
			type: 'select',
			options: statusOptions,
		},
		sort: true,
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
};

export default settings;
