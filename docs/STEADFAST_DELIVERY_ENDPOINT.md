# Steadfast Delivery Integration

## Overview

This endpoint integrates with Steadfast courier service to create delivery orders for existing e-commerce orders.

## Endpoint

```
POST /api/orders/steadfast-delivery
```

## Headers

```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

## Request Body

```json
{
	"orderId": "60d5ec49f1b2c8b1f8e4e1a1",
	"recipient_name": "John Doe",
	"recipient_phone": "01712345678",
	"recipient_address": "123 Main Street, Dhaka 1000",
	"cod_amount": 1500,
	"note": "Handle with care"
}
```

### Required Fields

- `orderId` (string): MongoDB ObjectId of the existing order
- `recipient_name` (string): Name of the delivery recipient
- `recipient_phone` (string): Phone number of the recipient
- `recipient_address` (string): Full delivery address
- `cod_amount` (number): Cash on delivery amount

### Optional Fields

- `note` (string): Special delivery instructions

## Response

### Success Response (201)

```json
{
	"success": true,
	"message": "Steadfast delivery created successfully",
	"data": {
		"delivery": {
			"id": "60d5ec49f1b2c8b1f8e4e1a2",
			"invoice": "0001",
			"trackingId": "SF123456789",
			"trackingUrl": "https://steadfast.com.bd/t/SF123456789",
			"status": "pending",
			"deliveryCompany": "Steadfast"
		},
		"steadfastResponse": {
			"tracking_code": "SF123456789",
			"invoice_id": "0001",
			"consignment_id": 12345
		}
	}
}
```

### Error Responses

#### 400 - Missing Required Fields

```json
{
	"success": false,
	"message": "Missing required fields: orderId, recipient_name, recipient_phone, recipient_address, cod_amount"
}
```

#### 404 - Order Not Found

```json
{
	"success": false,
	"message": "Order not found"
}
```

#### 400 - Order Already Has Delivery

```json
{
	"success": false,
	"message": "Order already has a delivery assigned"
}
```

#### 400 - API Credentials Not Configured

```json
{
	"success": false,
	"message": "Steadfast API credentials not configured. Please set STEADFAST_API_KEY and STEADFAST_SECRET_KEY environment variables."
}
```

#### 400 - Steadfast API Error

```json
{
	"success": false,
	"message": "Steadfast API error: Invalid recipient phone number",
	"steadfastError": {
		"status": 400,
		"message": "Invalid recipient phone number"
	}
}
```

#### 500 - Server Error

```json
{
	"success": false,
	"message": "Internal server error while creating Steadfast delivery",
	"error": "Error message details"
}
```

## Environment Variables Required

Add the following environment variables to your `.env` file:

```env
STEADFAST_API_KEY=your_steadfast_api_key_here
STEADFAST_SECRET_KEY=your_steadfast_secret_key_here
```

## Database Changes

The endpoint automatically:

1. Creates a new `Delivery` record in the database
2. Updates the `Order` record with:
   - `delivery`: Reference to the delivery record
   - `courier`: Set to "Steadfast"
   - `trackingNumber`: Steadfast tracking code
   - `trackingUrl`: Steadfast tracking URL
   - `status`: Updated to "processing"

## Steadfast API Integration

This endpoint calls the Steadfast API at:

```
https://portal.packzy.com/api/v1/create_order
```

### Request Headers to Steadfast

- `Api-Key`: Your Steadfast API key
- `Secret-Key`: Your Steadfast secret key
- `Content-Type`: application/json

### Request Payload to Steadfast

```json
{
	"invoice": "0001",
	"recipient_name": "John Doe",
	"recipient_phone": "01712345678",
	"recipient_address": "123 Main Street, Dhaka 1000",
	"cod_amount": 1500,
	"note": "Order 0001 delivery"
}
```

## Permissions Required

- User must be authenticated (valid JWT token)
- User must have `add_order` permission

## Usage Example

```javascript
const response = await fetch('/api/orders/steadfast-delivery', {
	method: 'POST',
	headers: {
		Authorization: 'Bearer your-jwt-token',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		orderId: '60d5ec49f1b2c8b1f8e4e1a1',
		recipient_name: 'John Doe',
		recipient_phone: '01712345678',
		recipient_address: '123 Main Street, Dhaka 1000',
		cod_amount: 1500,
		note: 'Handle with care',
	}),
});

const data = await response.json();
console.log(data);
```

## Testing

You can test this endpoint using any HTTP client like Postman, cURL, or a frontend application. Make sure to:

1. Have valid Steadfast API credentials in environment variables
2. Use a valid JWT token in Authorization header
3. Provide a valid existing order ID
4. Ensure the order doesn't already have a delivery assigned

## Error Handling

The endpoint includes comprehensive error handling for:

- Missing or invalid request data
- Order not found or already has delivery
- Missing API credentials
- Steadfast API errors
- Network/server errors

All errors are returned with appropriate HTTP status codes and descriptive messages.
