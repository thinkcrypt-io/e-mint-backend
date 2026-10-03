import { SettingsType } from '../../imports.js';

const STATUS = [
	{ label: 'Waiting', value: 'waiting' },
	{ label: 'Invited', value: 'invited' },
	{ label: 'Joined', value: 'joined' },
	{ label: 'Declined', value: 'declined' },
];

const TEAM_SIZE = [
	{ label: 'Just me', value: 'just-me' },
	{ label: '2–10', value: '2-10' },
	{ label: '11–50', value: '11-50' },
	{ label: '51–200', value: '51-200' },
	{ label: '200+', value: '200+' },
];

const settings: SettingsType<any> = {
	email: {
		title: 'Email',
		type: 'email',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: { default: true, sort: true },
	},
	name: {
		title: 'Name',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: { default: true, sort: true },
	},
	company: {
		title: 'Company',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: { default: true, sort: true },
	},
	role: {
		title: 'Role',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: { sort: true },
	},
	teamSize: {
		title: 'Team size',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'teamSize',
			field: 'teamSize_in',
			type: 'multi-select',
			label: 'Team size',
			title: 'Filter by Team size',
			options: TEAM_SIZE,
		},
		schema: { type: 'select', sort: true, default: true, options: TEAM_SIZE },
	},
	useCase: {
		title: 'What they want to build',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: { type: 'textarea' },
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: STATUS,
		},
		schema: { type: 'select', sort: true, default: true, options: STATUS },
	},
	source: {
		title: 'Signed up on',
		type: 'string',
		sort: true,
		schema: { sort: true },
	},
	invitedAt: {
		title: 'Invited at',
		type: 'date',
		sort: true,
		edit: true,
		schema: { type: 'date', tableType: 'date', sort: true },
	},
	note: {
		title: 'Internal note',
		type: 'string',
		search: true,
		edit: true,
		schema: { type: 'textarea' },
	},
	createdAt: {
		title: 'Joined the list',
		type: 'date',
		sort: true,
		filter: { name: 'createdAt', type: 'date', label: 'Joined the list', title: 'Filter by Joined the list' },
		schema: { type: 'date', tableType: 'date', sort: true, default: true },
	},
};

export default settings;
