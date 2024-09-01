import Customer from '../customer/customer.model.js';
import Product from '../products/products.model.js';
import User from '../user/user.model.js';

////import Category from './category.model.js';

const orderStatus = [
	{ key: 'Placed', label: 'placed' },
	{ key: 'Pending', label: 'pending' },
	{ key: 'Processing', label: 'processing' },
	{ key: 'Completed', label: 'completed' },
	{ key: 'Cancelled', label: 'cancelled' },
	{ key: 'Refunded', label: 'refunded' },
	{ key: 'Failed', label: 'failed' },
];

const settings: any = {
	user: {
		sort: true,
		title: 'Seller',
		type: 'string',
		filter: {
			name: 'user',
			field: 'user_in',
			type: 'multi-select',
			label: 'Seller',
			title: 'Sort by seller',
			options: [],
			category: 'model',
			model: User,
			key: 'name',
		},
	},

	items: {
		type: 'uri',
		title: 'Order Items',
		sort: true,
		filter: {
			name: 'items',
			field: 'items_in',
			type: 'multi-select',
			label: 'Product',
			title: 'Sort by products',
			options: [],
			category: 'model',
			model: Product,
			key: 'name',
		},
	},

	total: {
		type: 'number',
		title: 'Total Price',
	},

	vat: {
		type: 'number',
		title: 'VAT',
	},
	cart: {
		type: 'object',
		title: 'Cart',
	},

	subTotal: {
		type: 'number',
		title: 'Sub Total',

		sort: true,
		filter: {
			name: 'Total Price',
			field: 'subTotal',
			type: 'range',
			label: 'Total',
			title: 'Sort by total price',
		},
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
		filter: {
			name: 'isPaid',
			field: 'isPaid',
			type: 'boolean',
			label: 'Payment Status',
			title: 'Sort by payment status',
		},
	},

	note: {
		type: 'string',
		title: 'Note',
		allowNull: true,
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
			field: 'status',
			type: 'multi-select',
			label: 'Order Status',
			title: 'Sort by order status',
			options: orderStatus,
		},
	},

	customer: {
		sort: true,
		title: 'Customer',
		type: 'string',
		populate: {
			path: 'customer',
			select: 'name email',
		},
		filter: {
			name: 'customer',
			field: 'customer_in',
			type: 'multi-select',
			label: 'Seller',
			title: 'Sort by customer',
			options: [],
			category: 'model',
			model: Customer,
			key: 'name',
		},
	},

	orderDate: {
		type: 'string',
		title: 'Order date',
	},

	isCancelled: {
		type: 'boolean',
		edit: true,
		title: 'Cancel Status',
		//sort: true,
		filter: {
			name: 'isCancelled',
			field: 'isCancelled',
			type: 'boolean',
			label: 'Cancel Status',
			title: 'Sort by cancel status',
		},
	},

	discount: {
		type: 'number',
		title: 'Discount',
	},

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
	},
};

export default settings;
