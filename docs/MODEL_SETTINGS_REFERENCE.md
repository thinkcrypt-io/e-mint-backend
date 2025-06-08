# Model Settings Reference

This document provides a comprehensive reference for all model settings in the e-mint backend system.

## Settings File Structure

Each model follows a consistent structure in its settings file:

```typescript
import { SettingsType } from '../../lib/types/settings.types.js';
import { ModelType } from './model.types.js';

const settings: SettingsType<ModelType> = {
	// Field configurations
};

export default settings;
```

## Complete Model Settings Catalog

### 1. Admin Settings (`models/admin/admin.settings.ts`)

Manages administrator accounts and permissions.

**Key Fields:**

- `name` - Admin name (required, searchable, sortable)
- `email` - Unique email address
- `phone` - Contact number
- `role` - Admin role with population from Role model
- `permissions` - Array of permission strings
- `isActive` - Account status

**Notable Features:**

- Role-based filtering
- Permission management
- Account status tracking

### 2. Client Settings (`models/client/client.settings.ts`)

Manages client information and relationships.

**Key Fields:**

- `name` - Client name (required, searchable)
- `email` - Client email
- `company` - Company information
- `address`, `city`, `country` - Location details
- `website` - Business website
- `projects` - Related projects array

**Notable Features:**

- Geographic filtering (city, country)
- Business information tracking
- Project relationship management

### 3. Document Settings (`models/document/document.settings.ts`)

Handles document management and categorization.

**Key Fields:**

- `name` - Document name (required)
- `description` - Document description
- `docUrl` - Document URL (external link)
- `fileUrl` - File attachment URL
- `category` - Document category
- `project` - Related project
- `client` - Document owner
- `addedBy` - User who added the document

**Notable Features:**

- Multiple URL types (view/download)
- Project and client relationships
- Category-based organization
- User tracking

### 4. Employee Settings (`models/employee/employee.settings.ts`)

Employee management and HR functionality.

**Key Fields:**

- `name` - Employee name
- `email` - Work email
- `position` - Job position
- `department` - Department assignment
- `salary` - Salary information
- `hireDate` - Date of hiring
- `isActive` - Employment status

### 5. Issue Settings (`models/issues/issues.settings.ts`)

Bug tracking and issue management system.

**Key Fields:**

- `code` - Issue identifier
- `name` - Issue title
- `description` - Detailed description
- `status` - Current status (open, in-progress, resolved, etc.)
- `priority` - Priority level (low, medium, high, critical)
- `project` - Related project
- `assignedTo` - Assigned team member
- `assignees` - Additional watchers
- `dueDate` - Due date
- `images` - Screenshots array
- `attachment` - File attachments

**Status Options:**

- Open, In Progress, On Hold, Testing, Resolved, Closed, Pending, Review, Reopened, Invalid, Needs Discussion

**Priority Levels:**

- Low, Medium, High, Critical

### 6. Maintenance Settings (`models/maintenance/maintenance.settings.ts`)

System maintenance and project updates tracking.

**Key Fields:**

- `code` - Maintenance identifier
- `name` - Maintenance title
- `project` - Related project
- `description` - Maintenance details
- `startDate` - Start date
- `endDate` - End date
- `status` - Maintenance status
- `priority` - Priority level
- `attachment` - Related files

**Status Options:**

- Active, Pending, Ended, On Hold, Extended, Cancelled

### 7. Meeting Settings (`models/meeting/meeting.settings.ts`)

Meeting scheduling and management.

**Key Fields:**

- `title` - Meeting title
- `description` - Meeting agenda
- `date` - Meeting date/time
- `duration` - Meeting duration
- `attendees` - Participant list
- `location` - Meeting location
- `type` - Meeting type (in-person, virtual, etc.)
- `status` - Meeting status

### 8. Portfolio Settings (`models/portfolio/portfolio.settings.ts`)

Portfolio project showcase management.

**Key Fields:**

- `name` - Project name
- `image` - Main project image
- `isVideoEnabled` - Video thumbnail toggle
- `videoURL` - Video URL
- `thumbnail` - Video thumbnail
- `category` - Project category
- `status` - Portfolio status
- `priority` - Display priority
- `liveUrl` - Live project URL
- `client` - Client name
- `shortDescription` - Brief description
- `longDescription` - Detailed description
- `tags` - Technology tags
- `techStack` - Technology stack array
- `review` - Client review
- `duration` - Project duration
- `year` - Development year

**Content Sections:**

- Challenge description
- Product description
- Company information
- Approach methodology
- Solution features
- Case study details

### 9. Project Settings (`models/project/settings.ts` & `models/software/settings.ts`)

Software project management and tracking.

**Key Fields:**

- `name` - Project name
- `description` - Project description
- `category` - Project category
- `clientName` - Client information
- `projectType` - Type of project
- `status` - Current status
- `priority` - Project priority
- `startDate` - Project start date
- `endDate` - Expected completion
- `deadline` - Final deadline
- `devUrl`, `testUrl`, `prodUrl`, `liveUrl` - Environment URLs
- `frameworks` - Technology frameworks
- `libraries` - Used libraries
- `githubUrl` - Repository URL
- `client` - Related client
- `assignedTo` - Project manager

**Status Options:**

- Planning, In Progress, Paused, Testing, Completed, Maintenance, Review, Cancelled, Archived

### 10. Resource Settings (`models/resources/resources.settings.ts`)

Knowledge base and resource management.

**Key Fields:**

- `code` - Resource identifier
- `name` - Resource name
- `description` - Resource description
- `category` - Resource category
- `url` - Resource URL
- `type` - Resource type
- `attachment` - File attachments
- `tags` - Categorization tags
- `priority` - Importance level
- `focusArea` - Target area

**Resource Types:**

- Website, Article, Documentation, Inspiration, Tutorial, Video, Git Repo, Internal Doc, Mockup, Audio, Podcast, Blog, Book, Other

### 11. Shop Settings (`models/shop/shop.settings.ts`)

E-commerce shop management.

**Key Fields:**

- `id` - Shop identifier
- `name` - Shop name
- `owner` - Shop owner
- `activeTheme` - Current theme
- `description` - Shop description
- `logo` - Shop logo
- `image` - Shop image
- `coverImage` - Cover image
- `location` - Shop location
- `address` - Physical address
- `email` - Contact email
- `phone` - Contact phone
- `package` - Subscription package
- `expire` - Expiration date
- `trial` - Trial status
- `meta` - SEO metadata
- `metaKeywords` - SEO keywords

**Social Media Fields:**

- `website`, `facebook`, `instagram`, `linkedin`, `youtube`, `twitter`, `whatsapp`, `daraz`, `tiktok`

### 12. Staff Settings (`models/staff/staff.settings.ts`)

Staff management for multi-location businesses.

**Key Fields:**

- `name` - Staff name
- `shop` - Assigned shop
- `location` - Work location
- `email` - Staff email
- `phone` - Contact number
- `role` - Staff role
- `isActive` - Active status

### 13. User Settings (`models/user/user.settings.ts`)

Customer/user account management.

**Key Fields:**

- `name` - User name
- `username` - Unique username
- `email` - User email
- `phone` - Contact number
- `shop` - Associated shop
- `role` - User role
- `isActive` - Account status
- `isDeleted` - Deletion status
- `password` - User password (excluded from responses)

## Common Patterns

### Location-Based Filtering

Many models include location-based filtering:

```typescript
location: {
  filter: {
    name: 'location',
    field: 'location_in',
    type: 'multi-select',
    category: 'model',
    model: Location,
    key: 'name'
  }
}
```

### Status Management

Most entities include status tracking:

```typescript
status: {
  filter: {
    type: 'multi-select',
    options: [/* status options */]
  },
  schema: {
    type: 'select',
    options: [/* same options */]
  }
}
```

### User Relationships

Many models track who created/modified records:

```typescript
addedBy: {
  populate: { path: 'addedBy', select: 'name email' },
  filter: {
    category: 'model',
    model: Admin,
    key: 'name'
  }
}
```

### Date Fields

Consistent date handling across models:

```typescript
createdAt: {
  title: 'Created at',
  type: 'date',
  sort: true,
  schema: { type: 'date', tableType: 'date-only' }
}
```

## Best Practices

1. **Consistent Naming** - Use consistent field names across models
2. **Required Fields** - Mark essential fields as required
3. **Search Optimization** - Enable search on user-facing fields
4. **Filter Strategy** - Provide meaningful filter options
5. **Relationship Management** - Use populate for related data
6. **UI Configuration** - Configure schema for optimal user experience
7. **Validation** - Set appropriate min/max values
8. **Documentation** - Use clear titles and helper text
