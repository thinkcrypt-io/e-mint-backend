import { SettingsType } from '../../imports.js';
import { PurchaseType } from './index.js';

const purchaseSettings: SettingsType<PurchaseType> = {
	invoice: {
		sort: true,
		title: 'Invoice',
		type: 'string',

		filter: {
			name: 'invoice',
			field: 'invoice',
			type: 'text',
			label: 'Invoice',
			title: 'Search Invoice',
		},
	},
	addedBy: {
		sort: true,
		title: 'Added By',
		type: 'string',
		populate: {
			path: 'addedBy',
			select: 'name email',
		},
	},
	shop: {
		sort: true,
		title: 'Shop',
		type: 'string',
	},
	createdAt: {
		sort: true,
		title: 'Created At',
		type: 'string',
	},
	isCancelled: {
		sort: true,
		title: 'Active',
		type: 'boolean',
		edit: true,
	},
	isDelivered: {
		sort: true,
		title: 'Is Delivered',
		type: 'boolean',
		edit: true,
	},
	dueAmount: {
		sort: true,
		title: 'Due Amount',
		type: 'number',
	},
	paidAmount: {
		sort: true,
		title: 'Paid Amount',
		type: 'number',
	},
	returnedAmount: {
		sort: true,
		title: 'Returned Amount',
		type: 'number',
	},
	subTotal: {
		required: true,
		sort: true,
		title: 'Sub Total',
		type: 'number',
	},
	total: {
		required: true,
		sort: true,
		title: 'Total',
		type: 'number',
	},
	date: {
		sort: true,
		title: 'Created At',
		type: 'string',
		required: true,
		filter: {
			name: 'date',
			field: 'date',
			type: 'date',
			label: 'Date',
			title: 'Filter by date',
		},
	},
	items: {
		sort: true,
		required: true,
		title: 'Items',
		type: 'array-object',
	},
	note: {
		edit: true,
		title: 'Note',
		type: 'string',
	},
	supplier: {
		sort: true,
		title: 'Supplier',
		type: 'string',
		required: true,
		populate: {
			path: 'supplier',
			select: 'name email',
		},
	},

	discount: {
		sort: true,
		title: 'Discount',
		type: 'number',
	},
	shippingCost: {
		sort: true,
		title: 'Shipping Cost',
		type: 'number',
	},
	totalItems: {
		sort: true,
		title: 'Total Items',
		type: 'number',
	},
	status: {
		sort: true,
		title: 'Status',
		type: 'string',

		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Status',
			options: [
				{ label: 'Pending', value: 'pending' },
				{ label: 'Completed', value: 'completed' },
				{ label: 'Partially Delivered', value: 'partially-delivered' },
				{ label: 'Delivered', value: 'delivered' },
				{ label: 'Cancelled', value: 'cancelled' },
			],
		},
	},

	isPaid: {
		sort: true,
		title: 'Is Paid',
		type: 'boolean',

		edit: true,
		filter: {
			name: 'isPaid',
			field: 'isPaid',
			type: 'boolean',
			label: 'Paid',
			title: 'Is Paid',
		},
	},
};

export default purchaseSettings;
