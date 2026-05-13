# OTP Verification System

## Overview

The CCTV Analysis System now includes a comprehensive OTP (One-Time Password) verification system for:
- Email verification
- Phone number verification  
- Password reset functionality
- User registration with verification

## Features

### 1. Public User Registration
- Users can sign up without admin intervention
- Creates unverified accounts
- Requires: name, email, phone, password
- Optional: company name

### 2. Email OTP Verification
- Professional HTML email templates
- 6-digit OTP valid for 5 minutes
- Maximum 3 verification attempts
- Uses nodemailer with SMTP

### 3. Phone OTP Verification
- SMS delivery via SMSGatewayHub
- Same OTP rules as email (6-digit, 5 min, 3 attempts)
- Uses existing SMS service credentials

### 4. Password Reset
- Email-based OTP for password reset
- Secure flow: request OTP → verify OTP → reset password
- No username required, only email

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password_here

# SMS Configuration (existing)
SMS_API_KEY=your_sms_api_key
SMS_SENDER_ID=your_sender_id
SMS_ENTITY_ID=your_entity_id
SMS_TEMPLATE_OTP=your_otp_template_id

# Alert Phone Numbers
ALERT_PHONE_NUMBERS=+919999999999,+918888888888
```

### Gmail Setup (for Email OTP)

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Select "Mail" and "Other (Custom name)"
   - Copy the 16-character password
3. Use this App Password as `SMTP_PASS` in your `.env`

### SMS Setup (for Phone OTP)

1. Get DLT approval for OTP template from SMSGatewayHub
2. Template format: `Your OTP for CCTV Analysis verification is {#var#}. Valid for 5 minutes. Do not share with anyone. - SSC`
3. Add template ID to `SMS_TEMPLATE_OTP` in `.env`

## API Endpoints

### 1. Public Signup
```http
POST /api/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+919876543210",
  "password": "password123",
  "companyName": "ABC Company"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account created successfully. Please verify your email and phone.",
  "data": {
    "id": 5,
    "email": "john@example.com",
    "phone": "+919876543210",
    "verified": false
  }
}
```

### 2. Send OTP
```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "identifier": "john@example.com",
  "type": "email"
}
```

**Parameters:**
- `identifier`: Email or phone number
- `type`: "email" or "phone"

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to your email"
}
```

### 3. Verify OTP
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "identifier": "john@example.com",
  "otp": "123456",
  "type": "email"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### 4. Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If the email exists, a password reset OTP has been sent"
}
```

### 5. Reset Password
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "email": "john@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

## User Flow

### Registration Flow
1. User submits signup form → `POST /auth/signup`
2. Account created with `verified = false`
3. User receives email/SMS with OTP → `POST /auth/send-otp`
4. User enters OTP → `POST /auth/verify-otp`
5. Account marked as verified
6. User can now login

### Password Reset Flow
1. User clicks "Forgot Password" → `POST /auth/forgot-password`
2. OTP sent to registered email
3. User enters OTP and new password → `POST /auth/reset-password`
4. Password updated, user can login with new password

## Security Features

### OTP Security
- **Expiry**: 5 minutes from generation
- **Attempts**: Maximum 3 verification attempts
- **Storage**: In-memory (for production, use Redis)
- **Auto-cleanup**: OTPs automatically deleted after expiry

### Password Security
- Minimum 6 characters
- Hashed with bcrypt (salt rounds: 10)
- Never stored in plain text

### Email Security
- No user enumeration (same response for existing/non-existing emails)
- Rate limiting recommended (implement in production)

## Database Schema

### Users Table Updates
```sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN company_name VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN verified_date DATETIME NULL;
```

## Testing

### Test Email OTP
```bash
# 1. Signup
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+919999999999",
    "password": "test123"
  }'

# 2. Send OTP
curl -X POST http://localhost:3001/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "test@example.com",
    "type": "email"
  }'

# 3. Check email for OTP, then verify
curl -X POST http://localhost:3001/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "test@example.com",
    "otp": "123456",
    "type": "email"
  }'
```

### Test Password Reset
```bash
# 1. Request reset
curl -X POST http://localhost:3001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# 2. Check email for OTP, then reset
curl -X POST http://localhost:3001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "otp": "123456",
    "newPassword": "newpass123"
  }'
```

## Production Considerations

### 1. Use Redis for OTP Storage
Replace in-memory Map with Redis:
```javascript
// Install redis
npm install redis

// Update otpService.js to use Redis
const redis = require('redis');
const client = redis.createClient();
```

### 2. Add Rate Limiting
```javascript
// Install express-rate-limit
npm install express-rate-limit

// Add to routes
const rateLimit = require('express-rate-limit');

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5 // 5 requests per window
});

router.post('/send-otp', otpLimiter, ...);
```

### 3. Email Service Alternatives
- **SendGrid**: Professional email service
- **AWS SES**: Amazon's email service
- **Mailgun**: Developer-friendly email API

### 4. Monitoring
- Log all OTP requests
- Monitor failed verification attempts
- Alert on suspicious patterns

## Troubleshooting

### Email Not Sending
1. Check SMTP credentials in `.env`
2. Verify Gmail App Password is correct
3. Check firewall/network allows port 587
4. Review logs: `tail -f logs/combined.log`

### SMS Not Sending
1. Verify SMS_TEMPLATE_OTP is configured
2. Check SMSGatewayHub account balance
3. Ensure phone numbers include country code
4. Review SMS service logs

### OTP Not Verifying
1. Check OTP hasn't expired (5 minutes)
2. Verify correct identifier (email/phone)
3. Ensure type matches ('email' or 'phone')
4. Check for typos in OTP

## Files Modified/Created

### Created
- `src/services/otpService.js` - OTP generation and verification
- `src/services/emailService.js` - Email sending with nodemailer
- `OTP_SYSTEM_README.md` - This documentation

### Modified
- `src/controllers/AuthController.js` - Added OTP endpoints
- `src/routes/auth.js` - Added OTP routes
- `src/services/smsService.js` - Added OTP SMS template
- `src/migrations/017_add_user_verification_fields.sql` - Database schema
- `.env.example` - Added SMTP and OTP configuration
- `API_DOCUMENTATION.md` - Added OTP endpoint documentation

## Support

For issues or questions:
1. Check logs in `logs/combined.log` and `logs/error.log`
2. Verify environment variables are set correctly
3. Test SMTP connection: `node -e "require('./src/services/emailService').verifyEmailConfig()"`
4. Review API documentation in `API_DOCUMENTATION.md`
