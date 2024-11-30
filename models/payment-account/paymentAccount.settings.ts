import { PaymentAccountType as Type } from './index.js';
import { filters, SettingsType } from '../../imports.js';

const paymentAccountSettings: SettingsType<Type> = {
	name: {
		type: 'string',
		required: true,
		title: 'Name',
		search: true,
		sort: true,
		edit: true,
	},
	accountNumber: {
		type: 'string',
		required: true,
		title: 'Account Number',
		search: true,
		sort: true,
		edit: true,
	},
	accountType: {
		type: 'string',
		required: true,
		title: 'Account Type',
		search: true,
		sort: true,
		edit: true,
	},
	balance: {
		type: 'number',
		required: true,
		title: 'Balance',
		edit: true,
	},
	customAttributes: {
		type: 'array-object',
		title: 'Custom Attributes',
		edit: true,
	},
	tags: {
		type: 'array-string',
		title: 'Tags',
		edit: true,
		search: true,
	},
	shop: {
		type: 'string',
		title: 'Shop',
	},
	isDeleted: {
		type: 'boolean',
		title: 'Is Deleted',
		edit: true,
	},
	createdAt: {
		type: 'string',
		title: 'Created At',
		sort: true,
		filter: filters?.createdAt,
	},
	note: {
		type: 'string',
		title: 'Note',
		edit: true,
	},
	bankName: {
		type: 'string',
		title: 'Bank Name',
		edit: true,
	},
	branchName: {
		type: 'string',
		title: 'Branch Name',
		edit: true,
	},
};

export default paymentAccountSettings;
