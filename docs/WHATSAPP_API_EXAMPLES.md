# WhatsApp API Integration Examples

## 1. Send Hello World Template (No Parameters)

```bash
curl -X POST "http://localhost:3000/api/whatsapp/send" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "type": "template",
    "templateName": "hello_world"
  }'
```

## 2. Send Template with Parameters

```bash
curl -X POST "http://localhost:3000/api/whatsapp/send" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "type": "template",
    "templateName": "sample_order_confirmation",
    "parameters": ["John Doe", "Order #12345", "2024-01-15"]
  }'
```

## 3. Send Simple Text Message

```bash
curl -X POST "http://localhost:3000/api/whatsapp/send" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "type": "text",
    "message": "Hello! This is a simple text message."
  }'
```

## 4. Validate Template Before Sending

```bash
curl -X POST "http://localhost:3000/api/whatsapp/validate-template" \
  -H "Content-Type: application/json" \
  -d '{
    "templateName": "hello_world",
    "parameters": []
  }'
```

## 5. Check Template with Wrong Parameter Count

```bash
curl -X POST "http://localhost:3000/api/whatsapp/validate-template" \
  -H "Content-Type: application/json" \
  -d '{
    "templateName": "hello_world",
    "parameters": ["extra_param"]
  }'
```

## Common Templates and Their Parameter Requirements

| Template Name                  | Parameters Required | Example Parameters                                     |
| ------------------------------ | ------------------- | ------------------------------------------------------ |
| hello_world                    | 0                   | None                                                   |
| sample_happy_hour_announcement | 2                   | ["Restaurant Name", "Happy Hour Time"]                 |
| sample_flight_confirmation     | 3                   | ["John Doe", "Flight AA123", "2024-01-15"]             |
| sample_hotel_confirmation      | 4                   | ["John Doe", "Hotel Name", "2024-01-15", "2024-01-17"] |
| sample_order_confirmation      | 3                   | ["John Doe", "Order #12345", "2024-01-15"]             |
| sample_shipping_confirmation   | 3                   | ["John Doe", "Tracking #ABC123", "2024-01-15"]         |

## Error Handling Examples

### Parameter Count Mismatch

If you send wrong number of parameters, you'll get:

```json
{
	"success": false,
	"message": "Parameter count mismatch for template \"hello_world\"",
	"details": "Number of parameters does not match",
	"expectedParameters": 0,
	"providedParameters": 1,
	"fix": "If using template \"hello_world\", make sure to provide exactly 0 parameters in the request body"
}
```

### Invalid Phone Number

```json
{
	"success": false,
	"message": "Invalid phone number format",
	"suggestion": "Use format: +1234567890 (include country code)",
	"providedNumber": "123456789"
}
```

### Template Does Not Exist

```json
{
	"success": false,
	"message": "Template \"nonexistent_template\" does not exist",
	"suggestion": "Create the template in Meta Business Manager or use an existing template"
}
```

## Environment Variables Required

Make sure to set these in your `.env` file:

```
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
```

## Tips for Template Management

1. **Create Templates in Meta Business Manager:**

   - Go to Meta Business Manager → WhatsApp Manager
   - Create message templates with appropriate parameters
   - Wait for approval before using

2. **Parameter Validation:**

   - Always validate parameters before sending
   - Use the `/validate-template` endpoint for testing
   - Check the parameter count matches your template

3. **Error Handling:**

   - Always handle API errors gracefully
   - Log errors for debugging
   - Provide user-friendly error messages

4. **Testing:**
   - Test with approved templates first
   - Use the validation endpoint during development
   - Test with different phone number formats
