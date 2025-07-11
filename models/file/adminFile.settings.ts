import { SettingsType } from '../../imports.js';
import Folder from '../folders/model.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			default: true,
			sort: true,
		},
	},
	description: {
		title: 'Description',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		trim: true,
		schema: {
			type: 'textarea',
		},
	},
	isActive: {
		title: 'Is active',
		type: 'boolean',
		sort: true,
		search: false,
		edit: true,
		required: true,
		filter: {
			name: 'isActive',
			type: 'boolean',
			label: 'Is active',
			title: 'Filter by Is active',
		},
		schema: {
			default: true,
			sort: true,
		},
	},
	url: {
		title: 'Url',
		type: 'string',

		required: true,
		schema: {
			viewType: 'image',
			default: true,
			sort: true,
		},
	},
	folder: {
		title: 'Folder',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,

		filter: {
			type: 'multi-select',
			name: 'folder',
			field: 'folder_in',
			label: 'Folder',
			title: 'Filter by Folder',
			category: 'distinct',
			key: 'folder',
		},

		schema: {
			default: true,
			sort: true,
		},
	},
	fileFolder: {
		title: 'Folder',
		type: 'string',
		sort: true,
		edit: true,
		populate: {
			path: 'fileFolder',
			select: 'name isActive priority',
		},

		filter: {
			name: 'fileFolder',
			field: 'fileFolder_in',
			type: 'multi-select',
			category: 'model',
			model: Folder,
			key: 'name',
			label: 'Folder',
			title: 'Filter by Folder',
		},

		schema: {
			type: 'data-menu',
			tableType: 'string',
			tableKey: 'folder.name',
			model: 'folders',
			default: true,
			sort: true,
		},
	},
	key: {
		title: 'URL Key',
		type: 'string',
		sort: false,
		search: true,
		edit: true,
		required: true,

		schema: {
			default: true,
			sort: true,
		},
	},
	type: {
		title: 'Media Type',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,

		filter: {
			type: 'multi-select',
			name: 'type',
			field: 'type_in',
			label: 'Media Type',
			title: 'Filter by Media Type',
			category: 'distinct',
			key: 'type',
		},

		schema: {
			default: true,
			sort: true,
		},
	},
	fileType: {
		title: 'File type',
		type: 'string',
		sort: true,
		search: true,
		edit: true,

		filter: {
			name: 'fileType',
			field: 'fileType_in',
			type: 'multi-select',
			label: 'File Type',
			title: 'Filter by File Type',
			options: [
				{
					label: 'Image',
					value: 'image',
				},
				{
					label: 'Document',
					value: 'document',
				},
				{
					label: 'Video',
					value: 'video',
				},
			],
		},
		schema: {
			default: true,
			sort: true,
			type: 'select',
			options: [
				{
					label: 'Image',
					value: 'image',
				},
				{
					label: 'Document',
					value: 'document',
				},
				{
					label: 'Video',
					value: 'video',
				},
			],
		},
	},
	bucket: {
		title: 'AWS Bucket',
		type: 'string',
		sort: false,
		search: true,
		edit: true,

		schema: {
			default: true,
			sort: true,
		},
	},
	size: {
		title: 'Size',
		type: 'number',
		schema: {
			default: true,
			sort: true,
		},
	},
	fileSize: {
		title: 'Size (KB)',
		type: 'string',
		schema: {
			default: true,
		},
	},
	createdAt: {
		title: 'Created at',
		type: 'date',
		sort: true,
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Created at',
			title: 'Filter by Created at',
		},
		schema: {
			type: 'date',
			tableType: 'date-only',
		},
	},
};
export default settings;
