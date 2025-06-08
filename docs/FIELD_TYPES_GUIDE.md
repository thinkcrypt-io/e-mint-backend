# E-Mint Settings System Field Types Guide

This comprehensive guide covers all supported field types in the E-Mint settings system, with detailed examples, schema configurations, and best practices for each type.

## Table of Contents

1. [String Fields](#string-fields)
2. [Text Fields](#text-fields)
3. [Email Fields](#email-fields)
4. [URI Fields](#uri-fields)
5. [Date Fields](#date-fields)
6. [Boolean Fields](#boolean-fields)
7. [Number Fields](#number-fields)
8. [Array String Fields](#array-string-fields)
9. [Array Number Fields](#array-number-fields)
10. [Array Object Fields](#array-object-fields)
11. [Object Fields](#object-fields)
12. [Array Fields](#array-fields)
13. [Schema Type Configurations](#schema-type-configurations)
14. [Advanced Examples](#advanced-examples)

---

## String Fields

**Type:** `string`  
**Purpose:** Basic text input fields for short text content

### Basic String Field

```typescript
name: {
  title: 'Name',
  type: 'string',
  required: true,
  search: true,
  edit: true,
  trim: true,
  schema: {
    default: true,
    displayInTable: true,
    sort: true
  }
}
```

### String with Select Dropdown

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

### String with Data Menu (Relationship)

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
    tableKey: 'client.name',
    sort: true
  }
}
```

### String with Copy Feature

```typescript
meetingId: {
  title: 'Meeting ID',
  type: 'string',
  edit: true,
  schema: {
    copy: true,
    displayInTable: true
  }
}
```

---

## Text Fields

**Type:** `text`  
**Purpose:** Longer text content, passwords, and multiline text

### Basic Text Field

```typescript
password: {
  title: 'Password',
  type: 'text',
  required: true,
  min: 8,
  exclude: true,
  edit: true
}
```

### Phone Number Field

```typescript
phone: {
  title: 'Phone',
  type: 'text',
  unique: true,
  search: true,
  edit: true,
  required: true,
  schema: {
    default: true,
    displayInTable: true
  }
}
```

---

## Email Fields

**Type:** `email`  
**Purpose:** Email addresses with built-in validation

### Basic Email Field

```typescript
email: {
  title: 'Email',
  type: 'email',
  required: true,
  unique: true,
  search: true,
  edit: true,
  trim: true,
  schema: {
    default: true,
    displayInTable: true,
    sort: true
  }
}
```

### Email with Table Display Override

```typescript
contactEmail: {
  title: 'Contact Email',
  type: 'email',
  search: true,
  edit: true,
  schema: {
    displayInTable: true,
    type: 'string',  // Override display type for table
    default: true
  }
}
```

---

## URI Fields

**Type:** `uri`  
**Purpose:** URLs, file uploads, and external links

### Basic URI Field

```typescript
website: {
  title: 'Website',
  type: 'uri',
  edit: true,
  schema: {
    viewType: 'external-link'
  }
}
```

### Image Upload Field

```typescript
photo: {
  title: 'Profile Photo',
  type: 'uri',
  edit: true,
  schema: {
    type: 'image',
    folder: 'employee-photos'
  }
}
```

### File Upload Field

```typescript
resume: {
  title: 'Resume',
  type: 'uri',
  edit: true,
  schema: {
    type: 'file',
    displayInTable: true
  }
}
```

### External Link with Copy Feature

```typescript
meetingUrl: {
  title: 'Meeting URL',
  type: 'uri',
  edit: true,
  schema: {
    displayInTable: true,
    type: 'string',
    tableType: 'external-link',
    viewType: 'external-link',
    copy: true
  }
}
```

---

## Date Fields

**Type:** `date`  
**Purpose:** Date and time values

### Basic Date Field

```typescript
dateOfBirth: {
  title: 'Date of Birth',
  type: 'date',
  sort: true,
  edit: true,
  schema: {
    type: 'date',
    tableType: 'date-only',
    sort: true
  }
}
```

### Date with Filter

```typescript
createdAt: {
  title: 'Created At',
  type: 'date',
  sort: true,
  filter: {
    name: 'createdAt',
    type: 'date',
    label: 'Created At',
    title: 'Filter by Created At'
  },
  schema: {
    type: 'date',
    tableType: 'date-only',
    sort: true
  }
}
```

### Contract End Date

```typescript
contractEndDate: {
  title: 'Contract End Date',
  type: 'date',
  sort: true,
  edit: true,
  filter: {
    name: 'contractEndDate',
    type: 'date',
    label: 'Contract End Date',
    title: 'Filter by Contract End Date'
  },
  schema: {
    type: 'date',
    tableType: 'date-only',
    sort: true
  }
}
```

---

## Boolean Fields

**Type:** `boolean`  
**Purpose:** True/false values and checkboxes

### Basic Boolean Field

```typescript
isActive: {
  title: 'Active Status',
  type: 'boolean',
  sort: true,
  edit: true,
  filter: {
    name: 'isActive',
    type: 'boolean',
    label: 'Active',
    title: 'Filter by Active Status'
  },
  schema: {
    default: true,
    sort: true
  }
}
```

### Featured Flag

```typescript
isFeatured: {
  title: 'Is Featured',
  type: 'boolean',
  sort: true,
  edit: true,
  filter: {
    name: 'isFeatured',
    type: 'boolean',
    label: 'Is Featured',
    title: 'Filter by Featured Status'
  },
  schema: {
    default: true,
    sort: true
  }
}
```

### Subscription Status

```typescript
isSubscribedToEmail: {
  title: 'Email Subscription',
  type: 'boolean',
  sort: true,
  edit: true,
  filter: {
    name: 'isSubscribedToEmail',
    type: 'boolean',
    label: 'Subscribed To Email',
    title: 'Filter by Email Subscription'
  }
}
```

---

## Number Fields

**Type:** `number`  
**Purpose:** Numeric values, counts, prices, and ratings

### Basic Number Field

```typescript
priority: {
  title: 'Priority',
  type: 'number',
  sort: true,
  edit: true,
  schema: {
    default: true,
    sort: true
  }
}
```

### Price Field

```typescript
price: {
  title: 'Price',
  type: 'number',
  edit: true,
  required: true,
  min: 0,
  schema: {
    displayInTable: true,
    sort: true
  }
}
```

### Salary Range

```typescript
minSalary: {
  title: 'Minimum Salary',
  type: 'number',
  sort: true,
  edit: true,
  required: true,
  min: 0,
  filter: {
    name: 'minSalary',
    type: 'range',
    label: 'Minimum Salary',
    title: 'Filter by Minimum Salary'
  }
}
```

### Count with Range Filter

```typescript
count: {
  title: 'SMS Count',
  type: 'number',
  sort: true,
  required: true,
  filter: {
    name: 'count',
    type: 'range',
    label: 'SMS Count',
    title: 'Filter by SMS Count'
  }
}
```

---

## Array String Fields

**Type:** `array-string`  
**Purpose:** Arrays of string values, tags, and multi-select data

### Basic Tags Field

```typescript
tags: {
  title: 'Tags',
  type: 'array-string',
  edit: true,
  schema: {
    type: 'tag'
  },
  filter: {
    name: 'tags',
    field: 'tags_in',
    type: 'multi-select',
    label: 'Tags',
    title: 'Filter by Tags',
    category: 'distinct',
    key: 'tags'
  }
}
```

### Skills Array

```typescript
skills: {
  title: 'Skills',
  type: 'array-string',
  edit: true,
  schema: {
    type: 'tag'
  }
}
```

### Collection References

```typescript
collection: {
  title: 'Collection',
  type: 'array-string',
  sort: true,
  edit: true,
  filter: {
    name: 'collection',
    field: 'collection_in',
    type: 'multi-select',
    label: 'Collection',
    title: 'Filter by Collection',
    category: 'model',
    model: Collection,
    key: 'name'
  }
}
```

### Frameworks List

```typescript
frameworks: {
  title: 'Frameworks',
  type: 'array-string',
  edit: true,
  schema: {
    type: 'tag'
  }
}
```

### Participants List

```typescript
participants: {
  title: 'Participants',
  type: 'array-string',
  edit: true,
  schema: {
    type: 'tag'
  }
}
```

---

## Array Number Fields

**Type:** `array-number`  
**Purpose:** Arrays of numeric values

### Basic Number Array

```typescript
ratings: {
  title: 'Ratings',
  type: 'array-number',
  edit: true,
  schema: {
    min: 1,
    max: 5
  }
}
```

---

## Array Object Fields

**Type:** `array-object`  
**Purpose:** Complex arrays containing objects

### Custom Attributes

```typescript
customAttributes: {
  title: 'Custom Attributes',
  type: 'array-object',
  edit: true,
  schema: {
    type: 'object-array'
  }
}
```

### FAQ Section

```typescript
faq: {
  title: 'FAQ',
  type: 'array-object',
  edit: true,
  schema: {
    type: 'object-array'
  }
}
```

---

## Object Fields

**Type:** `object`  
**Purpose:** Complex single objects

### Basic Object Field

```typescript
metadata: {
  title: 'Metadata',
  type: 'object',
  edit: true,
  schema: {
    type: 'object'
  }
}
```

---

## Array Fields

**Type:** `array`  
**Purpose:** Generic arrays with complex structure

### Email Recipients

```typescript
to: {
  title: 'To',
  type: 'array',
  schema: {
    sort: false,
    default: false,
    type: 'tag'
  }
}
```

### Category Data Tags

```typescript
category: {
  title: 'Category',
  type: 'array',
  sort: true,
  edit: true,
  schema: {
    type: 'data-tag',
    model: 'servicecategories'
  },
  filter: {
    name: 'category',
    field: 'category_in',
    type: 'multi-select',
    category: 'model',
    model: ServiceCategory,
    key: 'name',
    label: 'Category',
    title: 'Filter by Category'
  }
}
```

### Simple Array String

```typescript
featureList: {
  title: 'Feature List',
  type: 'array',
  edit: true,
  schema: {
    type: 'array-string'
  }
}
```

### Section Data Array (Complex)

```typescript
experience: {
  title: 'Professional Experience',
  type: 'array',
  edit: true,
  schema: {
    type: 'section-data-array',
    section: {
      title: 'Professional Experience',
      addBtnText: 'Add Experience',
      btnText: 'Add Experience',
      display: {
        title: 'company',
        description: 'position'
      },
      dataModel: [
        { name: 'company', label: 'Company', type: 'text', isRequired: true },
        { name: 'position', label: 'Position', type: 'text', isRequired: true },
        { name: 'startDate', label: 'Start Date', type: 'date' },
        { name: 'endDate', label: 'End Date', type: 'date' },
        { name: 'description', label: 'Description', type: 'textarea' }
      ]
    }
  }
}
```

### Education Array

```typescript
education: {
  title: 'Education',
  type: 'array',
  edit: true,
  schema: {
    type: 'section-data-array',
    section: {
      title: 'Education',
      addBtnText: 'Add Degree',
      btnText: 'Add Degree',
      display: {
        title: 'institution',
        description: 'passingYear'
      },
      dataModel: [
        { name: 'institution', label: 'Institution', type: 'text', isRequired: true },
        { name: 'degree', label: 'Degree', type: 'text', isRequired: true },
        { name: 'field', label: 'Study Field', type: 'text' },
        { name: 'passingYear', label: 'Passing Year', type: 'date', isRequired: true },
        { name: 'grade', label: 'Grade', type: 'string' }
      ]
    }
  }
}
```

---

## Schema Type Configurations

The `schema.type` property controls how fields are rendered in the UI:

### Text Area

```typescript
description: {
  title: 'Description',
  type: 'string',
  edit: true,
  schema: {
    type: 'textarea',
    helperText: 'Enter a detailed description'
  }
}
```

### Select Dropdown

```typescript
priority: {
  title: 'Priority',
  type: 'string',
  edit: true,
  schema: {
    type: 'select',
    options: [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' }
    ]
  }
}
```

### Image Upload

```typescript
logo: {
  title: 'Company Logo',
  type: 'uri',
  edit: true,
  schema: {
    type: 'image',
    folder: 'company-logos'
  }
}
```

### File Upload

```typescript
attachment: {
  title: 'Attachment',
  type: 'uri',
  edit: true,
  schema: {
    type: 'file'
  }
}
```

### Data Menu (Relationship)

```typescript
assignedTo: {
  title: 'Assigned To',
  type: 'string',
  edit: true,
  populate: { path: 'assignedTo', select: 'name' },
  schema: {
    type: 'data-menu',
    model: 'admins',
    tableType: 'string',
    tableKey: 'assignedTo.name'
  }
}
```

### Tag Input

```typescript
technologies: {
  title: 'Technologies',
  type: 'array-string',
  edit: true,
  schema: {
    type: 'tag'
  }
}
```

### External Link

```typescript
portfolioUrl: {
  title: 'Portfolio URL',
  type: 'uri',
  edit: true,
  schema: {
    type: 'string',
    viewType: 'external-link',
    tableType: 'external-link'
  }
}
```

### Date Input

```typescript
startDate: {
  title: 'Start Date',
  type: 'date',
  edit: true,
  schema: {
    type: 'date',
    tableType: 'date-only'
  }
}
```

---

## Advanced Examples

### Complete Employee Field

```typescript
employee: {
  title: 'Employee',
  type: 'string',
  sort: true,
  edit: true,
  required: true,
  populate: { path: 'employee', select: 'name email' },
  filter: {
    name: 'employee',
    field: 'employee_in',
    type: 'multi-select',
    label: 'Employee',
    title: 'Filter by Employee',
    category: 'model',
    model: Admin,
    key: 'name'
  },
  schema: {
    displayInTable: true,
    default: true,
    sort: true,
    tableType: 'text',
    tableKey: 'employee.name',
    type: 'data-menu',
    model: 'admins',
    modelAddOn: 'email'
  }
}
```

### Complete Status Field with All Options

```typescript
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
      { label: 'In Progress', value: 'in-progress' },
      { label: 'Review', value: 'review' },
      { label: 'Approved', value: 'approved' },
      { label: 'Published', value: 'published' },
      { label: 'Archived', value: 'archived' }
    ]
  },
  schema: {
    displayInTable: true,
    default: true,
    sort: true,
    type: 'select',
    options: [
      { label: 'Draft', value: 'draft' },
      { label: 'In Progress', value: 'in-progress' },
      { label: 'Review', value: 'review' },
      { label: 'Approved', value: 'approved' },
      { label: 'Published', value: 'published' },
      { label: 'Archived', value: 'archived' }
    ]
  }
}
```

### Multi-Image Upload

```typescript
images: {
  title: 'Gallery Images',
  type: 'array-string',
  edit: true,
  schema: {
    type: 'image-array',
    folder: 'gallery',
    maxFiles: 10
  }
}
```

### Complex Features Array

```typescript
solutionFeatures: {
  title: 'Solution Features',
  type: 'array',
  edit: true,
  schema: {
    type: 'custom-section-array'
  }
}
```

---

## Field Property Reference

### Core Properties

- `title`: Display name for the field
- `type`: Field data type (from supported types list)
- `required`: Makes field mandatory
- `edit`: Allows field editing
- `search`: Enables text search on field
- `sort`: Enables sorting on field
- `unique`: Enforces uniqueness constraint
- `exclude`: Excludes from API responses
- `trim`: Auto-trims string values

### Validation Properties

- `min`: Minimum value/length
- `max`: Maximum value/length

### Relationship Properties

- `populate`: Mongoose population configuration
  - `path`: Field to populate
  - `select`: Fields to select from populated document
  - `populate`: Nested population

### UI Schema Properties

- `displayInTable`: Show in data tables
- `tableType`: Table display format (`string`, `date-only`, `external-link`, etc.)
- `tableKey`: Nested field path for table display
- `sort`: Enable column sorting
- `default`: Show by default in tables
- `viewType`: Display format in detail views
- `copy`: Enable copy-to-clipboard functionality
- `helperText`: Additional help text
- `tooltip`: Tooltip text

### Filter Properties

- `filter.name`: Filter identifier
- `filter.field`: Database field to filter (with `_in` suffix for arrays)
- `filter.type`: Filter UI type (`multi-select`, `range`, `boolean`, `date`, `text`)
- `filter.label`: Filter display label
- `filter.title`: Filter tooltip/description
- `filter.options`: Static options for select filters
- `filter.category`: Dynamic filter category (`model`, `distinct`)
- `filter.model`: Model for dynamic options
- `filter.key`: Field from model for options
- `filter.roles`: Role-based filter access

---

## Best Practices

### 1. Consistent Naming

- Use descriptive `title` values that match UI labels
- Use consistent `name` values in filters
- Follow camelCase for field names

### 2. Table Display

- Set `displayInTable: true` for important fields
- Use `default: true` for primary fields
- Configure appropriate `tableType` for proper display
- Use `tableKey` for nested object display

### 3. Search and Sort

- Enable `search` on text fields users will search
- Enable `sort` on fields users will want to order by
- Consider performance implications of searchable fields

### 4. Filters

- Provide filters for commonly queried fields
- Use `multi-select` for categorical data
- Use `range` for numeric fields
- Use `date` for time-based filtering
- Use `boolean` for yes/no fields

### 5. Relationships

- Always configure `populate` for referenced fields
- Use `data-menu` schema type for relationship selection
- Set appropriate `tableKey` for nested display
- Configure filters with `category: 'model'` for dynamic options

### 6. File Uploads

- Specify appropriate `folder` for organization
- Use `image` type for images, `file` for documents
- Consider using `external-link` viewType for URLs

### 7. Validation

- Set `required: true` for mandatory fields
- Use `min`/`max` for reasonable constraints
- Use `unique: true` sparingly and only when necessary
- Enable `trim: true` for text inputs

This guide provides comprehensive coverage of all field types and configurations available in the E-Mint settings system. Use these examples as templates for implementing your own model settings.
