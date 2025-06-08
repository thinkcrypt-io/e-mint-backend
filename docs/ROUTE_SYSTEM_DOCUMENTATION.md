# E-Mint Backend Route System Documentation

## Overview

The E-Mint backend uses a sophisticated route system that automatically generates REST API endpoints from model settings configurations. This system provides consistent patterns for CRUD operations, filtering, validation, permissions, and middleware integration across all models.

## Core Components

### 1. Settings-Based Route Generation

Routes are generated from model settings using the `constructConfig` function, which transforms settings into operational configurations:

```typescript
const config = constructConfig({
	model: Model,
	config: settings,
	options: { role: 'user' | 'admin' | 'seller' },
});
```

### 2. Route Definition Functions

#### Standard Routes (`commonRouter`)

Generic function for creating standard CRUD routes with consistent patterns:

```typescript
const router = commonRouter({
  Model: UserModel,
  settings: userSettings,
  permission: 'user',
  injectMiddleware?: {
    getAll?: [middleware1, middleware2],
    post?: [middleware3],
    // ... other operations
  },
  replaceController?: {
    getAll?: customController,
    post?: customPostController
  }
});
```

#### Admin Routes (`defineRoutes`)

Specialized function for admin routes with enhanced permissions:

```typescript
router.use('/users', defineRoutes({
  Model: User,
  settings: userSettings,
  permission: 'user',
  injectMiddleware?: {
    getAll: [hasAccess()],
    getById: [hasAccess()],
    export: [hasAccess()]
  }
}));
```

### 3. Configuration Processing

The `constructConfig` function generates:

- **VALIDATORS**: Joi schemas for POST/UPDATE operations
- **FILTER_OPTIONS**: Sortable and searchable fields
- **EXIST_OPTIONS**: Unique field validation
- **QUERY_OPTIONS**: Population and exclusion rules
- **EDITS**: Allowed edit fields
- **FILTER_LIST**: Dynamic filter definitions
- **EXPORT_OPTIONS**: Export configurations

## Route Patterns

### Standard Route Structure

Every model follows this consistent route pattern:

```
GET    /api/model/           - Get all documents
POST   /api/model/           - Create new document
GET    /api/model/:id        - Get single document
PUT    /api/model/:id        - Update document
DELETE /api/model/:id        - Delete document

GET    /api/model/edit/:id   - Get document for editing
PUT    /api/model/update/many - Update multiple documents

GET    /api/model/get/filters - Get available filters
GET    /api/model/get/count   - Get document count
GET    /api/model/get/sum/:field - Get field sum
GET    /api/model/get/schema  - Get model schema

POST   /api/model/export/csv - Export as CSV
POST   /api/model/export/pdf - Export as PDF

PUT    /api/model/copy/:id   - Duplicate document
```

### Middleware Stack

Routes use a standardized middleware stack:

```typescript
const middlewares = {
	// Creating documents
	post: [
		protect, // Authentication
		isExpired, // Subscription check
		validate(config.VALIDATORS.POST), // Validation
		ifExists(config.EXIST_OPTIONS), // Uniqueness check
		hasPermission([permissions.create]), // Authorization
	],

	// Getting all documents
	getAll: [
		protect,
		paginate, // Pagination
		filter(config.FILTER_OPTIONS), // Filtering
		hasPermission([permissions.read]),
	],

	// Updating documents
	update: [
		protect,
		isExpired,
		validate(config.VALIDATORS.UPDATE),
		hasPermission([permissions.update]),
	],

	// Additional operations...
};
```

## Route Types

### 1. User Routes (`/routes/`)

Standard seller/user routes with basic permissions:

```typescript
// Example: /routes/products.route.ts
const commonMiddleware = [
	protect,
	sort,
	query(config.FILTER_OPTIONS),
	hasPermission([permissions.read]),
];
```

### 2. Admin Routes (`/routes-admin/`)

Administrative routes with enhanced permissions:

```typescript
// Example: /routes-admin/admin.router.ts
router.use(
	'/products',
	defineRoutes({
		Model: Product,
		settings: productSettings,
		permission: 'product',
		injectMiddleware: {
			getAll: [hasAccess()],
			export: [hasAccess()],
		},
	})
);
```

### 3. User-Facing Routes (`/user-routes/`)

Public/customer-facing routes with minimal permissions:

```typescript
// Example: /user-routes/routes/product.user.route.ts
const commonMiddleware = [
	shop, // Shop context
	sort,
	query(config.FILTER_OPTIONS),
	customQuery({
		// Custom filtering
		query: { status: 'published' },
	}),
];
```

### 4. Staff Routes (`/staff/`)

Internal staff routes with specialized middleware:

```typescript
// Example: /staff/products.staff.route.ts
const commonMiddleware = [
	productProtect, // Product-specific auth
	sort,
	query(config.FILTER_OPTIONS),
];
```

### 5. App Routes (`/app-route/`)

Mobile app routes with simplified patterns:

```typescript
// Example: /app-route/categories/category.approute.ts
router.get(
	'/',
	store, // Store context
	paginate,
	filter(config.FILTER_OPTIONS),
	getAllDocuments(config.QUERY_OPTIONS)
);
```

## Controller Integration

### Standard Controllers

Routes use consistent controller patterns:

- `getAllDocuments(config.QUERY_OPTIONS)` - Fetch multiple documents
- `getDocumentById(config.QUERY_OPTIONS)` - Fetch single document
- `createDocument(config.MODEL)` - Create new document
- `updateDocument(config.EDITS)` - Update document
- `deleteDocument(config.MODEL)` - Delete document

### Specialized Controllers

Some routes use model-specific controllers:

```typescript
// Custom order processing
router.post('/', ...postMiddleware, addOrder);

// Custom inventory adjustment
router.post('/damages', ...damagePostMiddleware, adjustStock, createDocument(config.MODEL));
```

## Permission System

### Permission Generation

Permissions are automatically generated from model names:

```typescript
const permissions = constructPermissions('product');
// Generates: { create: 'add_product', read: 'view_product', update: 'edit_product', delete: 'delete_product' }
```

### Role-Based Access

Different route types use different permission systems:

- **User Routes**: `hasPermission(['add_product'])`
- **Admin Routes**: `adminPermissions([permissions.create])`
- **Staff Routes**: Custom permission checks

## Middleware Injection

### Injecting Additional Middleware

Routes support middleware injection for customization:

```typescript
defineRoutes({
	Model: Meeting,
	settings: meetingSettings,
	permission: 'meetings',
	injectMiddleware: {
		getAll: [hasAccess()], // Add access control
		getById: [hasAccess()],
		export: [hasAccess()],
	},
});
```

### Replacing Controllers

Routes support controller replacement:

```typescript
commonRouter({
	Model: Order,
	settings: orderSettings,
	permission: 'order',
	replaceController: {
		post: customOrderController, // Replace default creation
		update: customUpdateController,
	},
});
```

## Dynamic Route Features

### Filtering and Sorting

Routes automatically support filtering and sorting based on settings:

```typescript
// Settings-defined filters become URL parameters
GET /api/products?status=published&category=electronics&sort=createdAt&order=desc
```

### Pagination

Standard pagination across all routes:

```typescript
GET /api/products?page=1&limit=20
```

### Search

Text search across configured fields:

```typescript
GET /api/products?search=laptop
```

### Export

Standardized export functionality:

```typescript
POST /api/products/export/csv
POST /api/products/export/pdf
```

## Custom Route Examples

### Specialized Product Routes

```typescript
// Low stock products
router.get(
	'/low-stock',
	...commonMiddleware,
	customQuery({
		query: { $expr: { $gte: ['$lowStockAlert', '$stock'] } },
	}),
	getAllDocuments(config.QUERY_OPTIONS)
);

// Top selling products
router.get('/top-selling', ...orderMiddleware, topSellingProductController);
```

### Inventory Adjustments

```typescript
// Damage-specific routes
router
	.route('/damages')
	.get(...commonMiddleware, ...damageMiddleware, getAllDocuments(config.QUERY_OPTIONS))
	.post(...damagePostMiddleware, ...postMiddleware, adjustStock, createDocument(config.MODEL));
```

### Order Processing

```typescript
// Order cancellation
router.delete('/:id', protect, cancelOrder);

// Order total calculation
router.post('/cart-total', getOrderTotal);
```

## Route Organization

### Directory Structure

```
routes/                     # Standard seller routes
routes-admin/              # Admin management routes
  ├── admin.router.ts      # Central admin router
  ├── common/router.ts     # Admin route generator
  └── [model]/             # Model-specific admin routes
user-routes/               # Customer-facing routes
staff/                     # Internal staff routes
app-route/                 # Mobile app routes
```

### Route Registration

Routes are registered in the main router:

```typescript
// routes/index.ts - Exports all route modules
export { default as productRoute } from './products.route.js';
export { default as orderRoute } from './order.route.js';

// app.ts - Registers routes
app.use('/api/products', productRoute);
app.use('/api/orders', orderRoute);
```

## Best Practices

### 1. Consistent Patterns

- Use `constructConfig` for all route configurations
- Follow standard middleware patterns
- Maintain consistent endpoint naming

### 2. Middleware Organization

- Group related middleware together
- Use descriptive middleware names
- Inject custom middleware when needed

### 3. Controller Reuse

- Use standard controllers when possible
- Create specialized controllers for complex logic
- Maintain controller consistency

### 4. Permission Management

- Use generated permissions when possible
- Apply appropriate permission levels
- Document custom permission logic

### 5. Error Handling

- Let middleware handle standard errors
- Implement custom error handling for specialized routes
- Provide meaningful error messages

## Integration with Settings System

The route system seamlessly integrates with the settings system:

1. **Settings Definition** → Model settings define available operations
2. **Configuration Processing** → `constructConfig` creates operational configs
3. **Route Generation** → Routes are generated with appropriate middleware
4. **Dynamic Behavior** → Routes adapt based on settings configuration

This integration ensures that changes to model settings automatically reflect in route behavior, maintaining consistency across the entire system.
