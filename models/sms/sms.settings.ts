import { filters, SettingsType } from '../../imports.js';
import { SMSType } from './index.js';

const smsSettings: SettingsType<SMSType> = {
	recipient: {
		type: 'string',
		required: true,
		title: 'Recipient',
		search: true,
		sort: true,
		filter: {
			name: 'recipient',
			field: 'recipient',
			type: 'text',
			label: 'Recipient',
			title: 'Find by Recipient',
		},
	},
	message: {
		type: 'string',
		required: true,
		title: 'Message',
		search: true,
	},
	status: {
		type: 'string',
		title: 'Status',
		search: true,
		sort: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			category: 'distinct',
			label: 'Status',
			title: 'Find by Status',
			key: 'status',
		},
	},
	count: {
		type: 'number',
		title: 'Count',
		sort: true,
		required: true,
		filter: {
			title: 'SMS Count',
			name: 'count',
			type: 'range',
			label: 'SMS Count',
		},
	},
	shop: {
		type: 'string',
		title: 'Shop',
		required: true,
		sort: true,
		filter: {
			name: 'shop',
			field: 'shop',
			type: 'text',
			label: 'Shop',
			title: 'Find by Shop',
			roles: ['admin'],
		},
	},
	rate: {
		type: 'number',
		title: 'Rate',
		required: true,
	},
	sentBy: {
		type: 'string',
		title: 'Sent By',
	},
	createdAt: {
		type: 'string',
		title: 'Created At',
		sort: true,
		filter: filters.createdAt,
	},
	source: {
		type: 'string',
		title: 'Source',
	},
};

export default smsSettings;
