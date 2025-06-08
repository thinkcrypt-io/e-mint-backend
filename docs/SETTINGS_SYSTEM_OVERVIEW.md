# E-Mint Backend Settings System Documentation

## Overview

The e-mint backend uses a comprehensive settings system that provides a unified way to configure models, define UI behavior, and generate API routes. This system enables dynamic form generation, filtering, validation, and data manipulation across the entire application.

## Architecture

The settings system consists of three main components:

1. **Settings Types** (`lib/types/settings.types.ts`) - Core type definitions
2. **Model Settings** (`models/*/settings.ts`) - Individual model configurations
3. **Route Generation** (`routes-admin/common/router.ts`) - Dynamic route creation

## Core Concepts

### Settings Type Definition

Every model setting follows the `SettingsType<T>` interface:

```typescript
type SettingType = {
	title: string; // Display name for the field
	type: string; // Field type (string, number, boolean, etc.)
	sort?: boolean; // Enable sorting on this field
	search?: boolean; // Enable search on this field
	unique?: boolean; // Enforce uniqueness
	exclude?: boolean; // Exclude from API responses
	required?: boolean; // Field is required
	filter?: Filter; // Define filtering options
	schema?: Schema; // UI schema configuration
	edit?: boolean; // Field is editable
	trim?: boolean; // Auto-trim string values
	populate?: object; // Mongoose population settings
	min?: number; // Minimum value/length
	max?: number; // Maximum value/length
};
```

### Supported Field Types

The system supports the following field types:

- `string` - Basic text fields
- `text` - Longer text content
- `email` - Email validation
- `uri` - URL validation
- `date` - Date fields
- `boolean` - True/false values
- `number` - Numeric values
- `array-string` - Array of strings
- `array-number` - Array of numbers
- `array-object` - Array of objects
- `object` - Complex object types

## Filter System

The settings system includes a powerful filtering mechanism:

```typescript
type Filter = {
	name: string; // Filter identifier
	type: 'multi-select' | 'range' | 'boolean' | 'date' | 'text' | 'select';
	label: string; // Display label
	title: string; // Filter title
	options?: { label: string; value: string }[]; // Predefined options
	category?: 'model' | 'distinct'; // Filter data source
	model?: mongoose.Model<any>; // Related model for filtering
	key?: string; // Field to use from related model
	roles?: string[]; // Role-based filter access
	field?: string; // Database field mapping
};
```

## Schema Configuration

The `schema` property controls UI behavior:

```typescript
schema: {
  type: 'textarea' | 'select' | 'image' | 'file' | 'tag' | 'data-menu',
  displayInTable: boolean,     // Show in data tables
  tableType: string,           // Table display format
  tableKey: string,            // Nested field for table display
  sort: boolean,               // Enable column sorting
  default: boolean,            // Show by default
  options: Array,              // Select options
  model: string,               // Related model name
  folder: string,              // Upload folder for files
  copy: boolean,               // Enable copy functionality
  viewType: string,            // Display format in views
  tooltip: string,             // Help tooltip
  helperText: string           // Additional help text
}
```

## Common Patterns

### Basic Field Configuration

```typescript
name: {
  title: 'Name',
  type: 'string',
  required: true,
  search: true,
  edit: true,
  unique: true,
  schema: {
    default: true,
    displayInTable: true,
    sort: true
  }
}
```

### Relationship Fields

```typescript
client: {
  title: 'Client',
  type: 'string',
  edit: true,
  sort: true,
  populate: {
    path: 'client',
    select: 'name email'
  },
  filter: {
    name: 'client',
    field: 'client_in',
    type: 'multi-select',
    label: 'Client',
    title: 'Filter by Client',
    category: 'model',
    model: Client,
    key: 'name'
  },
  schema: {
    type: 'data-menu',
    model: 'clients',
    default: true,
    displayInTable: true,
    tableKey: 'client.name'
  }
}
```

### File Upload Fields

```typescript
image: {
  title: 'Image',
  type: 'uri',
  edit: true,
  required: true,
  schema: {
    type: 'image',
    folder: 'portfolio-image'
  }
}
```

### Array Fields

```typescript
tags: {
  title: 'Tags',
  type: 'array-string',
  edit: true,
  schema: {
    type: 'tag'
  }
}
```

### Status/Select Fields

```typescript
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
    title: 'Filter by Status',
    options: [
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
      { label: 'Archived', value: 'archived' }
    ]
  },
  schema: {
    type: 'select',
    default: true,
    sort: true,
    options: [
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
      { label: 'Archived', value: 'archived' }
    ]
  }
}
```

## Benefits

1. **Consistency** - Unified configuration across all models
2. **DRY Principle** - Reusable patterns and configurations
3. **Type Safety** - TypeScript ensures proper configuration
4. **Dynamic UI** - Frontend can generate forms automatically
5. **Flexible Filtering** - Complex filter combinations
6. **Validation** - Built-in field validation
7. **Permissions** - Role-based field access control
8. **Extensibility** - Easy to add new field types and behaviors

## Next Steps

- [Model Settings Reference](./MODEL_SETTINGS_REFERENCE.md)
- [Route System Documentation](./ROUTE_SYSTEM_DOCUMENTATION.md)
- [Field Types Guide](./FIELD_TYPES_GUIDE.md)
- [Examples and Use Cases](./SETTINGS_EXAMPLES.md)
