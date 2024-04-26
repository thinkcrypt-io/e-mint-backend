//

import User from '../user/user.model.js';

const settings = {
	employee: {
		title: 'Employee',
		type: 'text',
		sort: true,

		populate: {
			path: 'employee',
			select: 'name',
		},
		filter: {
			name: 'employee',
			field: 'employee_in',
			type: 'multi-select',
			label: 'Employee',
			title: 'Sort by employee',
			options: [],
			category: 'model',
			model: User,
			key: 'name',
		},
	},

	date: {
		sort: true,
		type: 'string',
		title: 'Date',
	},

	createdAt: {
		sort: true,
		type: 'string',
		title: 'Date',
		filter: {
			name: 'Date',
			field: 'createdAt',
			type: 'date',
			label: 'Session Date',
			title: 'Sort by date',
		},
	},

	// start: {
	// 	search: true,
	// 	type: 'Date',
	// 	title: 'Start Time',
	// },

	// end: {
	// 	search: true,
	// 	type: 'Date',
	// 	title: 'End Time',
	// },

	status: {
		edit: true,
		sort: true,
		search: true,
		title: 'Status',
		type: 'string',
		required: true,
		trim: true,
	},

	lateCheckIn: {
		edit: true,
		type: 'boolean',
		title: 'Late',
		sort: true,

		filter: {
			name: 'lateCheckIn',
			type: 'boolean',
			label: 'Late',
			title: 'Late Check In',
		},
	},

	earlyCheckOut: {
		edit: true,
		type: 'boolean',
		title: 'Early Checkout',
		sort: true,

		filter: {
			name: 'earlyCheckOut',
			type: 'boolean',
			label: 'Early Leave',
			title: 'Early Check Out',
		},
	},

	halfDay: {
		edit: true,
		type: 'boolean',
		title: 'Half Day',
		sort: true,

		filter: {
			name: 'halfDay',
			type: 'boolean',
			label: 'Half Day',
			title: 'Half Day',
		},
	},

	completed: {
		edit: true,
		type: 'boolean',
		title: 'Completed',
		sort: true,

		filter: {
			name: 'completed',
			type: 'boolean',
			label: 'Completed',
			title: 'Completed',
		},
	},

	isActive: {
		edit: true,
		type: 'boolean',
		title: 'Active Status',
		sort: true,

		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Active',
			title: 'Sort by active status',
		},
	},
};

export default settings;
