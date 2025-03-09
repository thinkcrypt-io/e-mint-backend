import mongoose, { Schema, Types } from 'mongoose';
import { Admin, Client, Counter, Project, SettingsType, Software } from '../../imports.js';

const invoiceStatus = [
	{ label: 'Draft', value: 'draft' },
	{ label: 'Sent', value: 'sent' },
	{ label: 'Paid', value: 'paid' },
	{ label: 'Partial', value: 'partial' },
	{ label: 'Cancelled', value: 'cancelled' },
	{ label: 'Overdue', value: 'overdue' },
];

const InvoiceItemSchema = new Schema(
	{
		name: { type: String, required: true },
		description: { type: String },
		quantity: { type: Number, required: true },
		rate: { type: Number, required: true },
		total: { type: Number, required: true },
	},
	{ _id: false }
);

const schema = new Schema<Type>(
	{
		code: { type: String, trim: true, unique: true },
		name: { type: String, required: true, trim: true },
		description: { type: String, trim: true },
		client: { type: Schema.Types.ObjectId, ref: 'Client' },
		project: { type: Schema.Types.ObjectId, ref: 'Software' },
		issueDate: { type: Date, default: Date.now },
		dueDate: { type: Date },
		subTotal: { type: Number, required: true },
		total: { type: Number, required: true },
		tax: { type: Number },
		note: { type: String },
		items: { type: [InvoiceItemSchema], default: [] },
		status: {
			type: String,
			enum: ['draft', 'sent', 'paid', 'partial', 'cancelled', 'overdue'],
			required: true,
			default: 'draft',
		},
		access: [{ type: Schema.Types.ObjectId, ref: 'Admin' }],
		currency: { type: String, required: true, defualt: 'BDT' },
		addedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
		createdAt: { type: Date, default: Date.now },
	},
	{
		timestamps: true, // Automatically manages createdAt and updatedAt fields
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
);

let isNew = false;

schema.pre<any>('save', function (next) {
	isNew = this.isNew;
	next();
});

// Pre-save hook to auto-increment the invoice number
schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'invoice' });
			if (!counter) counter = new Counter({ sequenceValue: 50, slug: 'invoice' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `INV-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

type Type = {
	code: string;
	name: string;
	description?: string;
	client?: Types.ObjectId;
	project?: Types.ObjectId;
	issueDate?: Date;
	dueDate?: Date;
	subTotal?: number;
	total?: number;
	tax?: number;
	note?: string;
	items?: {
		name: string;
		description: string;
		quantity: number;
		rate: number;
		total: number;
	};
	status: 'draft' | 'sent' | 'paid' | 'partial' | 'cancelled' | 'overdue';
	currency: string;
	addedBy?: Types.ObjectId;
	access?: Types.ObjectId[];
	createdAt?: Date;
};

export const adminInvoiceSettings: SettingsType<any> = {
	code: {
		title: 'Code',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		// required: true,
		trim: true,
		filter: {
			name: 'code',
			field: 'code',
			type: 'text',
			label: 'Invoice',
			title: 'Sort by Invoice Code',
		},
		schema: { displayInTable: true, sort: true, default: true },
	},
	name: {
		title: 'Title',
		type: 'string',
		search: true,
		edit: true,
		required: true,
		trim: true,
		schema: { displayInTable: true, isRequired: true, sort: true, default: true },
	},
	description: {
		title: 'Description',
		type: 'string',
		search: true,
		edit: true,
		trim: true,
		schema: { type: 'textarea' },
	},
	client: {
		title: 'Client',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'client',
			field: 'client_in',
			type: 'multi-select',
			label: 'Client',
			title: 'Sort by Client',
			category: 'model',
			model: Client,
			key: 'name',
		},
		populate: { path: 'client', select: 'name email phone address' },
		schema: {
			type: 'data-menu',
			model: 'clients',
			default: true,
			displayInTable: true,
			tableKey: 'client.name',
			tableType: 'text',
			sort: true,
		},
	},
	clientAddress: {
		title: 'Client Address',
		type: 'string',
		schema: {
			type: 'text',
			tableKey: 'client.address',
			tableType: 'text',
		},
	},
	clientPhone: {
		title: 'Client Phone',
		type: 'string',
		schema: {
			type: 'text',
			tableKey: 'client.phone',
			tableType: 'text',
		},
	},
	clientEmail: {
		title: 'Client Email',
		type: 'string',
		schema: {
			type: 'text',
			tableKey: 'client.email',
			tableType: 'text',
		},
	},

	project: {
		title: 'Project',
		type: 'string',
		sort: true,
		edit: true,
		populate: { path: 'project', select: 'name' },
		schema: {
			type: 'data-menu',
			displayInTable: true,
			tableKey: 'project.name',
			tableType: 'text',
			sort: true,
			model: 'projects',
		},
		filter: {
			name: 'project',
			field: 'project_in',
			type: 'multi-select',
			label: 'Project',
			title: 'Sort by Project',
			category: 'model',
			model: Software,
			key: 'name',
		},
	},
	issueDate: {
		title: 'Issue Date',
		type: 'string',
		sort: true,
		edit: true,
		filter: {
			name: 'issueDate',
			label: 'Issue Date',
			title: 'Sort by Issue Date',
			type: 'date',
		},
		schema: {
			displayInTable: true,
			type: 'date',
			default: true,
			sort: true,
			tableType: 'date-only',
		},
	},
	dueDate: {
		title: 'Due Date',
		type: 'string',
		sort: true,
		edit: true,
		schema: { displayInTable: true, type: 'date', sort: true, tableType: 'date-only' },
	},
	subTotal: {
		title: 'Sub Total',
		type: 'number',
		edit: true,
		required: true,
		schema: { displayInTable: true, sort: true },
	},
	total: {
		title: 'Total',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		required: true,
		schema: { displayInTable: true, default: true },
	},
	tax: {
		title: 'Tax',
		type: 'number',
		sort: false,
		search: false,
		edit: true,
		schema: { displayInTable: true },
	},
	note: {
		title: 'Note',
		type: 'string',
		search: false,
		edit: true,
		schema: { type: 'textarea' },
	},
	items: {
		title: 'Items',
		type: 'array',
		edit: true,
		schema: {
			type: 'section-data-array',
			section: {
				title: 'Invoice Items',
				addBtnText: 'Add Invoice Item',
				btnText: 'Add Invoice Item',
				display: {
					title: 'name',
					description: 'total',
				},
				dataModel: [
					{ name: 'name', label: 'Name', type: 'text', isRequired: true },
					{ name: 'description', label: 'Description', type: 'textarea' },
					{ name: 'quantity', label: 'Quantity', type: 'number', isRequired: true, span: 1 },
					{ name: 'rate', label: 'Rate', type: 'number', isRequired: true, span: 1 },
					{ name: 'total', label: 'Total', type: 'number', isRequired: true },
				],
			},
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		edit: true,
		required: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Sort by Status',
			options: invoiceStatus,
		},
		schema: {
			displayInTable: true,
			type: 'select',
			options: invoiceStatus,
			default: 'true',
			sort: true,
		},
	},
	access: {
		title: 'Access',
		type: 'array',
		edit: true,
		sort: true,
		filter: {
			name: 'access',
			field: 'access_in',
			type: 'multi-select',
			label: 'Access',
			title: 'Sort by Access',
			category: 'model',
			model: Admin,
			key: 'name',
		},
		schema: {
			type: 'data-tag',
			model: 'admins',
			modelAddOn: 'email',
			heplerText: 'Who has access to this invoice',
		},
	},
	currency: {
		title: 'Currency',
		type: 'string',
		edit: true,
		required: true,
		schema: { displayInTable: true, sort: true },
	},
	addedBy: {
		title: 'Added By',
		type: 'string',
		sort: true,

		populate: { path: 'addedBy', select: 'name' },
		filter: {
			name: 'addedBy',
			field: 'addedBy_in',
			type: 'multi-select',
			label: 'Added By',
			title: 'Sort by Added By',
			category: 'model',
			model: Admin,
			key: 'name',
		},
		schema: { displayInTable: true, tableType: 'string', tableKey: 'addedBy.name' },
	},
	createdAt: {
		title: 'CreatedAt',
		type: 'string',
		schema: { displayInTable: true, type: 'date' },
	},
};

const AdminInvoice = mongoose.model<Type>('AdminInvoice', schema);

export default AdminInvoice;
