import { SettingsType } from '../../types/_index.js';

const settings: SettingsType<any> = {
	accountName: {
		title: 'Account Name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	accountNumber: {
		title: 'Account No.',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
		},
	},
	bankName: {
		title: 'Bank Name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: {
			default: true,
		},
	},
	branch: {
		title: 'Branch',
		type: 'string',
		edit: true,
		trim: true,
		schema: {
			default: true,
		},
	},
	routingNumber: {
		title: 'Routing Number',
		type: 'string',
		edit: true,
		trim: true,
		schema: {},
	},
	isDefault: {
		title: 'Default account',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'isDefault',
			type: 'boolean',
			label: 'Default account',
			title: 'Filter by default account',
		},
		schema: {
			default: true,
			sort: true,
			displayValue: {
				true: 'Default',
				false: '—',
			},
		},
	},
	isActive: {
		title: 'Is active',
		type: 'boolean',
		sort: true,
		edit: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Is active',
			title: 'Filter by Is active',
		},
		schema: {
			default: true,
			sort: true,
			displayValue: {
				true: 'Active',
				false: 'Disabled',
			},
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		edit: true,
		schema: {
			type: 'date-only',
			tableType: 'string',
		},
	},
};

export default settings;
