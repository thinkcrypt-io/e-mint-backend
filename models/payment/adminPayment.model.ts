// import mongoose, { Schema, Types } from 'mongoose';
// // import { CategoryType } from './category.type.js';
// import { Order, SettingsType, filters } from '../../imports.js';
// import Ledger from '../ledger/ledger.model.js';

// const schema = new Schema<PaymentType>(
// 	{
// 		invoice: {
// 			type: String,
// 			trim: true,
// 		},
// 		paymentInvoice: {
// 			type: String,
// 			trim: true,
// 		},
// 		currency: String,
// 		attachments: [String],
// 		status: {
// 			type: String,
// 			enum: ['pending', 'completed', 'failed', 'refunded'],
// 			default: 'pending',
// 		},

// 		amount: {
// 			type: Number,
// 			required: true,
// 		},
// 		order: {
// 			type: Schema.Types.ObjectId,
// 			ref: 'Order',
// 		},

// 		trnxId: String,
// 		reference: String,
// 		paymentMethod: {
// 			type: String,
// 			enum: [
// 				'cash',
// 				'cheque',
// 				'card',
// 				'bank',
// 				'bkash',
// 				'nagad',
// 				'rocket',
// 				'ssl',
// 				'stripe',
// 				'other',
// 			],
// 			// required: true,
// 		},

// 		date: {
// 			type: Date,
// 			required: true,
// 			default: Date.now,
// 		},
// 		tags: [String],
// 		note: {
// 			type: String,
// 			trim: true,
// 		},
// 		addedBy: {
// 			type: Schema.Types.ObjectId,
// 			ref: 'User',
// 		},
// 	},

// 	{
// 		timestamps: true,
// 	}
// );

// let isNewOrder = false;

// schema.pre<any>('save', function (next) {
// 	isNewOrder = this.isNew;
// 	next();
// });

// // Pre-save hook to auto-increment the invoice number
// schema.post<any>('save', async function (next) {
// 	try {
// 		if (this.status == 'refunded') {
// 			const getOrder: any = await Order.findById(this.order);
// 			getOrder.dueAmount = getOrder.dueAmount + this.amount;
// 			await getOrder.save();
// 		}
// 		if (isNewOrder) {
// 			if (this.order) {
// 				const getOrder: any = await Order.findById(this.order);
// 				const ledger = new Ledger({
// 					amount: this.amount,
// 					account: this.account,
// 					order: this.order,
// 					type: 'customer',
// 					amountReceived: this.account === 'credit' ? this.amount : 0,
// 					amountSent: this.account === 'debit' ? this.amount : 0,
// 					note: `Payment for ${getOrder?.invoice} with ${this.paymentMethod}`,
// 					date: this.date,
// 					customer: getOrder?.customer,
// 					shop: this.shop.toString(),
// 				});
// 				await ledger.save();
// 			}
// 		}
// 	} catch (error: any) {
// 		console.log('Error creating ledger entry:', error);
// 	}
// });

// type PaymentType = {
// 	invoice: string;
// 	amount: number;
// 	order?: Types.ObjectId;
// 	client?: Types.ObjectId;
// 	project?: Types.ObjectId;
// 	date: Date;
// 	tags: string[];
// 	note: string;
// 	trnxId: string;
// 	paymentInvoice?: string;
// 	paymentMethod: 'cash' | 'cheque' | 'bkash' | 'bank' | 'nagad' | 'payoneer' | 'other';
// 	reference?: string;
// 	currency: string;
// 	status: 'pending' | 'completed' | 'failed' | 'refunded';
// 	attachments?: string[];
// 	receipt?: string;
// 	createdAt?: Date;
// 	addedBy?: Types.ObjectId;
// };

// export const paymentSettings: SettingsType<PaymentType> = {
// 	invoice: {
// 		edit: true,
// 		sort: true,
// 		// search: true,
// 		title: 'Invoice',
// 		type: 'string',
// 		required: true,
// 		trim: true,
// 		filter: {
// 			name: 'invoice',
// 			field: 'invoice',
// 			type: 'text',
// 			label: 'Invoice',
// 			title: 'Sort by invoice',
// 		},
// 	},
// 	paymentInvoice: {
// 		edit: true,
// 		sort: true,
// 		// search: true,
// 		title: 'Payment Invoice',
// 		type: 'string',
// 		// required: true,
// 		trim: true,
// 		filter: {
// 			name: 'paymentInvoice',
// 			field: 'paymentInvoice',
// 			type: 'text',
// 			label: 'Payment Invoice',
// 			title: 'Sort by payment invoice',
// 		},
// 	},

// 	status: {
// 		edit: true,
// 		title: 'Status',
// 		type: 'string',
// 	},

// 	attachments: {
// 		edit: true,
// 		title: 'Attachments',
// 		type: 'array-string',
// 	},

// 	trnxId: {
// 		edit: true,
// 		title: 'Transaction Id',
// 		type: 'string',

// 		filter: {
// 			name: 'trnxId',
// 			field: 'trnxId',
// 			type: 'text',
// 			label: 'Tranx Id',
// 			title: 'Sort by transaction id',
// 		},
// 	},

// 	reference: {
// 		edit: true,
// 		title: 'Reference',
// 		type: 'string',
// 		trim: true,
// 		filter: {
// 			name: 'reference',
// 			field: 'reference',
// 			type: 'text',
// 			label: 'Ref',
// 			title: 'Sort by reference Id',
// 		},
// 	},

// 	amount: {
// 		edit: true,
// 		type: 'number',
// 		title: 'Amount',
// 		required: true,
// 		sort: true,
// 		filter: {
// 			name: 'amount',
// 			field: 'amount',
// 			type: 'range',
// 			label: 'Amount',
// 			title: 'Sort by amount',
// 		},
// 	},

// 	order: {
// 		edit: true,
// 		type: 'string',
// 		title: 'Order',
// 	},

// 	note: {
// 		edit: true,
// 		type: 'string',
// 		title: 'Note',
// 	},

// 	date: {
// 		sort: true,
// 		type: 'string',
// 		title: 'Date',
// 		required: true,
// 		filter: {
// 			name: 'date',
// 			field: 'date',
// 			type: 'date',
// 			label: 'Date',
// 			title: 'Sort by expense date',
// 		},
// 	},

// 	paymentMethod: {
// 		edit: true,
// 		type: 'string',
// 		title: 'Payment Method',
// 		required: true,
// 		filter: {
// 			name: 'paymentMethod',
// 			field: 'paymentMethod',
// 			type: 'multi-select',
// 			label: 'Payment Method',
// 			title: 'Sort by payment method',
// 			category: 'distinct',
// 		},
// 	},

// 	currency: {
// 		edit: true,
// 		type: 'string',
// 		title: 'Currency',
// 	},

// 	account: {
// 		edit: true,
// 		sort: true,
// 		title: 'Account',
// 		type: 'string',
// 		required: true,
// 		filter: {
// 			name: 'account',
// 			field: 'account',
// 			type: 'multi-select',
// 			label: 'Account',
// 			title: 'Sort by account',
// 			options: [
// 				{ label: 'Debit', value: 'debit' },
// 				{ label: 'Credit', value: 'credit' },
// 			],
// 		},
// 	},

// 	createdAt: {
// 		sort: true,
// 		type: 'string',
// 		title: 'Date',
// 	},

// 	tags: {
// 		edit: true,
// 		sort: true,
// 		title: 'Tags',
// 		type: 'array-string',
// 		filter: filters.tags,
// 	},
// 	// walletNo: {
// 	// 	edit: true,
// 	// 	title: 'Wallet No',
// 	// 	type: 'string',
// 	// },
// };

// const AdminPayment = mongoose.model<PaymentType>('AdminPayment', schema);

// export default AdminPayment;
