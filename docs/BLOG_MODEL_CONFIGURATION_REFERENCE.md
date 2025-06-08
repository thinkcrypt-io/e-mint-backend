# Model and Settings Configuration Reference

## Overview

This document serves as a complete reference for creating and configuring models in the e-mint backend system. Use this as a template for creating any new model with its corresponding settings configuration.

## Implementation Pattern

### Step 1: Create Model File (`models/{modelName}/model.ts`)

- Use TypeScript with `new Schema<any>` and `mongoose.model<any>` notation
- Use `any` types throughout for flexibility during development
- No interface definition needed for faster iteration
- Include proper validation, indexes, and middleware

#### Model Structure Template:

```typescript
import mongoose, { Schema, Document } from 'mongoose';

const {ModelName}Schema = new Schema<any>(
    {
        name: {
            type: String,
            required: [true, '{ModelName} name is required'],
            trim: true,
        },
        // Add other fields as needed
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Add indexes for performance
{ModelName}Schema.index({ name: 1 });
{ModelName}Schema.index({ status: 1 });
{ModelName}Schema.index({ createdAt: -1 });

// Add text search index if needed
{ModelName}Schema.index({
    name: 'text',
    description: 'text',
});

// Add pre-save middleware if needed
{ModelName}Schema.pre('save', function(next) {
    const doc = this as any;

    // Auto-generate slug if not provided
    if (!doc.slug && doc.name) {
        doc.slug = doc.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
    }

    next();
});

export default mongoose.model<any>('{ModelName}', {ModelName}Schema);
```

### Step 2: Create Settings File (`models/{modelName}/settings.ts`)

- Use TypeScript with `SettingsType<any>` notation
- Follow the exact pattern from `models/feature/settings.ts`
- Ensure compatibility with `getModelSettings.controller.ts`

#### Settings Structure Template:

```typescript
import { SettingsType } from '../../imports.js';

const settings: SettingsType<any> = {
	name: {
		title: 'Name',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
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
		required: true,
		trim: true,
		schema: {
			type: 'textarea',
			default: true,
		},
	},
	status: {
		title: 'Status',
		type: 'string',
		sort: true,
		search: true,
		edit: true,
		required: true,
		filter: {
			name: 'status',
			field: 'status_in',
			type: 'multi-select',
			label: 'Status',
			title: 'Filter by Status',
			options: [
				{ label: 'Draft', value: 'draft' },
				{ label: 'Published', value: 'published' },
				{ label: 'Archived', value: 'archived' },
			],
		},
		schema: {
			sort: true,
			default: true,
			type: 'select',
			options: [
				{ label: 'Draft', value: 'draft' },
				{ label: 'Published', value: 'published' },
				{ label: 'Archived', value: 'archived' },
			],
		},
	},
	createdAt: {
		title: 'Created At',
		type: 'date',
		sort: true,
		search: false,
		edit: false,
		filter: {
			name: 'createdAt',
			type: 'date',
			label: 'Created At',
			title: 'Filter by Created Date',
		},
		schema: {
			type: 'date',
			tableType: 'string',
		},
	},
	// Add other fields as needed
};

export default settings;
```

### Step 3: Create Model Index (`models/{modelName}/index.ts`)

```typescript
export { default as {ModelName} } from './model.js';
export { default as {modelName}Settings } from './settings.js';
```

### Step 4: Update Main Models Index (`models/index.ts`)

Add exports to the main models index file:

```typescript
//{ModelName}
export { default as {ModelName} } from './{modelName}/model.js';
export { default as {modelName}Settings } from './{modelName}/settings.js';
```

## Settings Configuration Structure

Each field in the settings should follow this structure:

```typescript
fieldName: {
    title: 'Display Name',
    type: 'string|number|date|boolean|array|ObjectId',
    sort: true|false,        // Enable/disable sorting
    search: true|false,      // Enable/disable search
    edit: true|false,        // Enable/disable editing
    required: true|false,    // Field is required
    trim: true|false,        // Auto-trim strings
    unique: true|false,      // Field must be unique
    filter: {                // Filter configuration (optional)
        name: 'fieldName',
        field: 'fieldName_in',
        type: 'multi-select|date|text',
        label: 'Filter Label',
        title: 'Filter Title',
        options: [...]       // For select filters
    },
    schema: {                // UI schema configuration
        type: 'input|textarea|select|image|date|richtext',
        default: true|false, // Show in default view
        readonly: true|false,// Read-only field
        sort: true|false,    // Enable sorting
        options: [...],      // For select fields
        ref: 'ModelName',    // For reference fields
        populate: {...}      // Population config
    }
}
```

## Field Types and Configurations

### Common Field Types:

- **string**: Text fields, textareas, select dropdowns
- **number**: Numeric fields with min/max validation
- **date**: Date/datetime fields
- **boolean**: Toggle/checkbox fields
- **array**: Arrays of strings, tags, or references
- **ObjectId**: References to other models

### Field Features:

- **Search enabled**: For content that needs to be searchable
- **Sort enabled**: For fields that need column sorting
- **Filters**: For fields that need filtering capabilities
- **Readonly**: For calculated or system fields
- **References**: For relationships with population config

## getModelSettings Controller Compatibility

The settings work with `getModelSettings.controller.ts` which:

1. Retrieves model schema paths
2. Generates default settings from schema
3. Can be overridden by custom settings file

### Controller Expected Properties:

- `title`: Display name for field
- `type`: Data type (matches Mongoose instance types)
- `sort`, `search`, `edit`, `required`: Boolean flags
- `filter`: Filter configuration object
- `schema`: UI schema configuration

## Best Practices

1. **Use `any` types** for faster development iteration
2. **Use `name` field** as primary identifier for consistency
3. **Remove TypeScript interfaces** to reduce complexity
4. **Follow feature/settings.ts pattern** exactly for compatibility
5. **Cover all model fields** in settings configuration
6. **Add proper indexing** for performance
7. **Include comprehensive validation** and middleware
8. **Use consistent naming** conventions

## Example Usage with getModelSettings API

Any model can be used with the getModelSettings endpoint:

```
GET /api/model-settings/{ModelName}
```

This returns field configurations for building admin interfaces.

## Reference Files

- `/models/feature/settings.ts` - Settings pattern reference
- `/controllers/common/getModelSettings.controller.ts` - Controller compatibility
- `/models/feature/model.ts` - Model structure reference

## File Structure for New Model

When creating a new model, create these files:

1. `/models/{modelName}/model.ts` - Mongoose model
2. `/models/{modelName}/settings.ts` - Admin settings configuration
3. `/models/{modelName}/index.ts` - Module exports
4. Update `/models/index.ts` - Add exports to main index

This configuration provides a complete, working model system that integrates with the existing admin interface and API structure.
