# OTP System - Quick Reference Card

## 🚀 Quick Start

### 1. Setup (One-time)
```bash
# Install dependencies
npm install nodemailer

# Run migration
npm run migrate

# Configure .env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMS_TEMPLATE_OTP=your_template_id
```

### 2. Test
```bash
./test_otp_system.sh
```

## 📋 API Endpoints Cheat Sheet

### Public Signup
```bash
POST /api/auth/signup
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+919876543210",
  "password": "password123",
  "companyName": "ABC Corp"  # optional
}
```

### Send OTP
```bash
POST /api/auth/send-otp
{
  "identifier": "john@example.com",  # or phone
  "type": "email"  # or "phone"
}
```

### Verify OTP
```bash
POST /api/auth/verify-otp
{
  "identifier": "john@example.com",
  "otp": "123456",
  "type": "email"
}
```

### Forgot Password
```bash
POST /api/auth/forgot-password
{
  "email": "john@example.com"
}
```

### Reset Password
```bash
POST /api/auth/reset-password
{
  "email": "john@example.com",
  "otp": "123456",
  "newPassword": "newpass123"
}
```

## 🔐 OTP Rules

| Property | Value |
|----------|-------|
| Length | 6 digits |
| Validity | 5 minutes |
| Max Attempts | 3 |
| Storage | In-memory (use Redis in prod) |
| Auto-cleanup | Yes |

## 📧 Email Template

**Subject**: Email Verification OTP - CCTV Analysis System

**Content**: Professional HTML with:
- Blue header with system name
- Large OTP in dashed box
- 5-minute validity notice
- Security warning
- Responsive design

## 📱 SMS Template

```
Your OTP for CCTV Analysis verification is {OTP}. Valid for 5 minutes. Do not share with anyone. - SSC
```

**DLT Required**: Yes (get from SMSGatewayHub)

## 🗄️ Database Fields

```sql
phone VARCHAR(20) NULL
company_name VARCHAR(255) NULL
verified BOOLEAN DEFAULT FALSE
verified_date DATETIME NULL
```

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `.env` | SMTP & SMS credentials |
| `src/services/otpService.js` | OTP logic |
| `src/services/emailService.js` | Email sending |
| `src/services/smsService.js` | SMS sending |
| `src/controllers/AuthController.js` | API handlers |
| `src/routes/auth.js` | Route definitions |

## 🧪 Testing Commands

```bash
# Test syntax
node -c src/controllers/AuthController.js
node -c src/services/emailService.js
node -c src/services/smsService.js

# Test email config
node -e "require('./src/services/emailService').verifyEmailConfig().then(console.log)"

# Run full test suite
./test_otp_system.sh

# Manual curl test
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","phone":"+919999999999","password":"test123"}'
```

## 🐛 Troubleshooting

### Email not sending?
```bash
# Check SMTP config
echo $SMTP_USER
echo $SMTP_HOST

# Test connection
node -e "require('./src/services/emailService').verifyEmailConfig().then(console.log)"

# Check logs
tail -f logs/error.log
```

### SMS not sending?
```bash
# Check template ID
echo $SMS_TEMPLATE_OTP

# Check SMS service
grep "SMS_TEMPLATE_OTP" .env

# Check logs
tail -f logs/combined.log | grep SMS
```

### OTP not verifying?
- Check OTP hasn't expired (5 min)
- Verify correct identifier (email/phone)
- Ensure type matches ('email' or 'phone')
- Check for typos in OTP
- Max 3 attempts per OTP

## 📊 Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created (signup) |
| 400 | Bad request / Invalid OTP |
| 401 | Unauthorized |
| 404 | User not found |
| 409 | User already exists |
| 500 | Server error |

## 🔄 User Flow Diagram

```
Signup → Send OTP → Verify OTP → Login
   ↓         ↓           ↓          ↓
 Create   Email/SMS   Update DB   JWT Token
 User     Sent        verified=1
```

## 📝 Common Use Cases

### 1. New User Registration
```
1. POST /auth/signup
2. POST /auth/send-otp (email)
3. POST /auth/verify-otp
4. POST /auth/login
```

### 2. Forgot Password
```
1. POST /auth/forgot-password
2. Check email for OTP
3. POST /auth/reset-password
4. POST /auth/login (with new password)
```

### 3. Verify Phone After Signup
```
1. POST /auth/send-otp (phone)
2. POST /auth/verify-otp (phone)
```

## 🚨 Security Checklist

- [ ] SMTP credentials in `.env` (not committed)
- [ ] SMS template DLT approved
- [ ] Rate limiting enabled (production)
- [ ] HTTPS enabled (production)
- [ ] Redis for OTP storage (production)
- [ ] Logs monitored for suspicious activity
- [ ] Email service verified
- [ ] SMS service tested

## 📚 Documentation Links

- **Full Guide**: `OTP_SYSTEM_README.md`
- **API Docs**: `API_DOCUMENTATION.md`
- **Changelog**: `CHANGELOG_OTP_SYSTEM.md`
- **Test Script**: `test_otp_system.sh`

## 💡 Pro Tips

1. **Gmail Setup**: Use App Password, not regular password
2. **Testing**: Use temporary email services (temp-mail.org)
3. **Logs**: Always check logs first when debugging
4. **OTP Storage**: Use Redis in production, not in-memory
5. **Rate Limiting**: Add to prevent abuse
6. **Monitoring**: Track OTP success/failure rates

## 🎯 Production Checklist

- [ ] Redis configured for OTP storage
- [ ] Rate limiting middleware added
- [ ] Professional email service (SendGrid/SES)
- [ ] SMS backup provider configured
- [ ] Monitoring & alerts set up
- [ ] Load testing completed
- [ ] Security audit done
- [ ] Documentation updated

## 📞 Support

**Issues?** Check:
1. Logs: `logs/combined.log`, `logs/error.log`
2. Environment: `.env` file configured?
3. Database: Migration run successfully?
4. Network: Firewall blocking SMTP/SMS?

**Still stuck?** Review full documentation in `OTP_SYSTEM_README.md`

---

**Version**: 1.0.0 | **Date**: April 22, 2026 | **Status**: ✅ Ready
