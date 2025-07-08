# WhatsApp API - Postman Examples

## Setup in Postman

1. **Create a new collection** called "WhatsApp API"
2. **Set base URL** as environment variable: `{{base_url}}` = `http://localhost:3000/api/whatsapp`
3. **Add headers** for all requests:
   - `Content-Type: application/json`

## 1. Send Custom Text Message

### Request Setup

- **Method**: POST
- **URL**: `{{base_url}}/send`
- **Headers**:
  ```
  Content-Type: application/json
  ```

### Request Body (raw JSON):

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "Hello! This is a custom message from our CRM system. How can we help you today?"
}
```

### Expected Response:

```json
{
	"success": true,
	"message": "WhatsApp message sent successfully",
	"data": {
		"messageId": "wamid.HBgMOTcxNTYzMjczMjEyFQIAERgSMkY0QjY5RjVEMjU2MjY2RjlEAA==",
		"to": "1234567890",
		"status": "sent"
	}
}
```

## 2. Send Hello World Template (No Parameters)

### Request Body:

```json
{
	"to": "+1234567890",
	"type": "template",
	"templateName": "hello_world",
	"templateLanguage": "en_US"
}
```

## 3. Send Template with Parameters

### Request Body:

```json
{
	"to": "+1234567890",
	"type": "template",
	"templateName": "sample_order_confirmation",
	"templateLanguage": "en_US",
	"parameters": ["John Doe", "Order #12345", "January 15, 2024"]
}
```

## 4. Send Custom Business Messages

### Welcome Message

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "Welcome to E-Mint! 🎉 Thank you for joining us. Your account has been successfully created. If you need any assistance, feel free to reach out to our support team."
}
```

### Order Confirmation

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "🛍️ Order Confirmed!\n\nOrder ID: #EM-2024-001\nTotal: $129.99\nEstimated Delivery: Jan 20, 2024\n\nTrack your order: https://e-mint.com/track/EM-2024-001\n\nThank you for shopping with E-Mint! 💚"
}
```

### Payment Reminder

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "💰 Payment Reminder\n\nHi John,\n\nYour invoice #INV-2024-001 for $89.99 is due tomorrow (Jan 16, 2024).\n\nPay now: https://e-mint.com/pay/INV-2024-001\n\nQuestions? Reply to this message or call us at +1-800-EMINT."
}
```

### Appointment Reminder

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "📅 Appointment Reminder\n\nHi Sarah,\n\nThis is a reminder of your upcoming appointment:\n\n📍 Date: Tomorrow, Jan 16, 2024\n⏰ Time: 2:00 PM\n📍 Location: E-Mint Office, 123 Main St\n\nNeed to reschedule? Reply RESCHEDULE"
}
```

### Support Message

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "🔧 Support Update\n\nTicket #SP-2024-001 Status: RESOLVED\n\nIssue: Login problems\nResolution: Password reset completed\n\nYou should now be able to access your account. If you still experience issues, please reply to this message.\n\nBest regards,\nE-Mint Support Team"
}
```

## 5. Marketing Messages

### Promotional Message

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "🎯 Special Offer Just for You!\n\n25% OFF on all premium features\nCode: PREMIUM25\nValid until: Jan 31, 2024\n\nUpgrade now: https://e-mint.com/upgrade\n\n*Terms & conditions apply"
}
```

### Event Invitation

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "🎪 You're Invited!\n\nE-Mint Product Launch Event\n📅 Date: February 15, 2024\n⏰ Time: 6:00 PM - 9:00 PM\n📍 Venue: Tech Hub, Downtown\n\nRSVP: https://e-mint.com/event-rsvp\n\nSee you there! 🚀"
}
```

## 6. Validate Template Before Sending

### Request Setup

- **Method**: POST
- **URL**: `{{base_url}}/validate-template`

### Request Body:

```json
{
	"templateName": "hello_world",
	"parameters": []
}
```

### Expected Response:

```json
{
	"success": true,
	"templateName": "hello_world",
	"isValid": true,
	"expectedParameters": 0,
	"providedParameters": 0,
	"message": "Template parameters are valid",
	"suggestion": "Ready to send"
}
```

## 7. Test Different Phone Number Formats

### With Country Code (+)

```json
{
	"to": "+1234567890",
	"type": "text",
	"message": "Testing with + country code"
}
```

### Without Country Code

```json
{
	"to": "1234567890",
	"type": "text",
	"message": "Testing without + country code"
}
```

## 8. Error Testing Examples

### Missing Phone Number

```json
{
	"type": "text",
	"message": "This will fail - no phone number"
}
```

### Missing Message for Text Type

```json
{
	"to": "+1234567890",
	"type": "text"
}
```

### Wrong Parameter Count

```json
{
	"to": "+1234567890",
	"type": "template",
	"templateName": "hello_world",
	"parameters": ["extra_param"]
}
```

## Postman Collection Variables

Create these variables in your Postman collection:

```json
{
	"base_url": "http://localhost:3000/api/whatsapp",
	"test_phone": "+1234567890",
	"your_phone": "+YOUR_ACTUAL_PHONE_NUMBER"
}
```

## Postman Tests (Add to Tests tab)

Add this JavaScript code to automatically test responses:

```javascript
// Test for successful response
pm.test('Status code is 200', function () {
	pm.response.to.have.status(200);
});

// Test for success field
pm.test('Response has success field', function () {
	var jsonData = pm.response.json();
	pm.expect(jsonData).to.have.property('success');
});

// Test for message ID in successful sends
pm.test('Message ID exists for successful sends', function () {
	var jsonData = pm.response.json();
	if (jsonData.success) {
		pm.expect(jsonData.data).to.have.property('messageId');
	}
});

// Log the response for debugging
console.log('Response:', pm.response.json());
```

## Environment Setup

1. **Development Environment**:

   - `base_url`: `http://localhost:3000/api/whatsapp`
   - `test_phone`: `+1234567890`

2. **Production Environment**:
   - `base_url`: `https://your-domain.com/api/whatsapp`
   - `test_phone`: `+YOUR_ACTUAL_PHONE`

## Quick Testing Workflow

1. **Start with validation**: Test `/validate-template` endpoint
2. **Test text messages**: Send simple text messages first
3. **Test templates**: Use `hello_world` template (no parameters)
4. **Test with parameters**: Use templates that require parameters
5. **Test error cases**: Try invalid inputs to test error handling

## Common Issues and Solutions

### Issue: "Invalid phone number"

**Solution**: Ensure phone number includes country code (e.g., `+1234567890`)

### Issue: "Number of parameters does not match"

**Solution**: Check template requirements using `/validate-template` endpoint

### Issue: "Template does not exist"

**Solution**: Verify template name exists in your Meta Business Manager

### Issue: "Invalid access token"

**Solution**: Check your `.env` file has correct `WHATSAPP_ACCESS_TOKEN`

## Pro Tips

1. **Use variables**: Store phone numbers and messages as Postman variables
2. **Create test suite**: Set up automated tests for all scenarios
3. **Environment switching**: Use different environments for dev/prod
4. **Save examples**: Save successful requests as examples in Postman
5. **Monitor responses**: Always check response status and message IDs
