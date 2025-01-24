import { populate } from 'dotenv';
import { Customer, Location } from '../../imports.js';
import Product from '../products/products.model.js';
import User from '../user/user.model.js';

////import Category from './category.model.js';

export const orderStatus = [
	{ label: 'Placed', value: 'placed' },
	{ label: 'Pending', value: 'pending' },
	{ label: 'Processing', value: 'processing' },
	{ label: 'Completed', value: 'completed' },
	{ label: 'Cancelled', value: 'cancelled' },
	{ label: 'Refunded', value: 'refunded' },
	{ label: 'Failed', value: 'failed' },
];

const settings: any = {
	user: {
		sort: true,
		title: 'Seller',
		type: 'string',
		// filter: {
		// 	name: 'user',
		// 	field: 'user_in',
		// 	type: 'multi-select',
		// 	label: 'Seller',
		// 	title: 'Sort by seller',
		// 	options: [],
		// 	category: 'model',
		// 	model: User,
		// 	key: 'name',
		// },
	},

	items: {
		type: 'uri',
		title: 'Order Items',
		sort: true,
		// filter: {
		// 	name: 'items',
		// 	field: 'items_in',
		// 	type: 'multi-select',
		// 	label: 'Product',
		// 	title: 'Sort by products',
		// 	options: [],
		// 	category: 'model',
		// 	model: Product,
		// 	key: 'name',
		// },
	},
	emailReceipt: {
		type: 'boolean',
		title: 'Email Receipt',
	},

	trnxRef: {
		type: 'string',
		title: 'Transaction Reference',
	},

	total: {
		type: 'number',
		title: 'Total Price',
	},

	profit: {
		type: 'profit',
		title: 'Profit',
	},

	vat: {
		type: 'number',
		title: 'VAT',
	},
	cart: {
		type: 'object',
		title: 'Cart',
	},

	origin: {
		type: 'string',
		title: 'Order From',
		edit: true,
		sort: true,
		filter: {
			name: 'origin',
			field: 'origin_in',
			type: 'multi-select',
			label: 'Order From',
			title: 'Sort by order from',
			options: [
				{ label: 'POS', value: 'pos' },
				{ label: 'Website', value: 'website' },
			],
		},
	},

	subTotal: {
		type: 'number',
		title: 'Sub Total',
		sort: true,
		// filter: {
		// 	name: 'Total Price',
		// 	field: 'subTotal',
		// 	type: 'range',
		// 	label: 'Total',
		// 	title: 'Sort by total price',
		// },
	},

	coupon: {
		type: 'string',
		title: 'Coupon',
	},

	isPaid: {
		type: 'boolean',
		edit: true,
		title: 'Payment Status',
		sort: true,
		// filter: {
		// 	name: 'isPaid',
		// 	field: 'isPaid',
		// 	type: 'boolean',
		// 	label: 'Payment Status',
		// 	title: 'Sort by payment status',
		// },
	},

	note: {
		type: 'string',
		title: 'Note',
		allowNull: true,
	},
	location: {
		type: 'string',
		title: 'Location',
		sort: true,
		populate: {
			path: 'location',
			select: 'name',
		},
		filter: {
			name: 'location',
			field: 'location_in',
			type: 'multi-select',
			label: 'Location',
			title: 'Sort by location',
			category: 'model',
			model: Location,
			key: 'name',
		},
	},

	address: {
		type: 'object',
		title: 'Address',
		edit: true,
	},

	shippingCharge: {
		type: 'number',
		title: 'VAT',
	},

	shop: {
		type: 'string',
		title: 'Shop',
		sort: true,
	},

	paymentMethod: {
		type: 'string',
		title: 'Payment method',
	},

	paymentAmount: {
		type: 'number',
		title: 'Payment amount',
	},

	dueAmount: {
		type: 'number',
		title: 'Due amount',
		sort: true,
	},
	returnAmount: {
		type: 'number',
		title: 'Due amount',
	},

	paidAmount: {
		type: 'number',
		title: 'Paid amount',
	},

	status: {
		type: 'string',
		title: 'Order Status',
		edit: true,
		sort: true,
		filter: {
			name: 'Status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Order Status',
			title: 'Sort by order status',
			options: orderStatus,
		},
	},

	courier: {
		type: 'string',
		title: 'Courier Name',
		edit: true,
	},
	isDelivered: {
		type: 'boolean',
		edit: true,
		title: 'Delivery Status',
		sort: true,
		filter: {
			name: 'isDelivered',
			field: 'isDelivered',
			type: 'boolean',
			label: 'Delivery Status',
			title: 'Sort by delivery status',
		},
	},
	trackingNumber: {
		type: 'string',
		title: 'Tracking Number',
		edit: true,
	},
	trackingUrl: {
		type: 'string',
		title: 'Tracking URL',
		edit: true,
	},

	customer: {
		sort: true,
		title: 'Customer',
		type: 'string',
		populate: {
			path: 'customer',
			select: 'name email',
		},
		// filter: {
		// 	name: 'customer',
		// 	field: 'customer_in',
		// 	type: 'multi-select',
		// 	label: 'Seller',
		// 	title: 'Sort by customer',
		// 	options: [],
		// 	category: 'model',
		// 	model: Customer,
		// 	key: 'name',
		// },
	},

	orderDate: {
		type: 'string',
		title: 'Order date',
	},

	isCancelled: {
		type: 'boolean',
		edit: true,
		title: 'Cancel Status',
		sort: true,
	},

	invoice: {
		type: 'string',
		title: 'Invoice',
		sort: true,
		// search: true,
		filter: {
			name: 'invoice',
			field: 'invoice',
			type: 'text',
			label: 'Invoice Number',
			title: 'Sort by invoice number',
		},
	},

	createdAt: {
		type: 'string',
		title: 'Created At',
		sort: true,
		filter: {
			name: 'Order Date',
			field: 'createdAt',
			type: 'date',
			label: 'Order Date',
			title: 'Sort by order date',
		},
	},

	discount: {
		type: 'number',
		title: 'Discount',
	},
};

export default settings;
