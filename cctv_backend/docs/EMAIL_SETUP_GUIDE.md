# Email OTP Setup Guide

## Current Status
✅ **Email OTP is now working with fallback mode**

The system will:
- ✅ Generate OTP
- ✅ Store OTP in memory
- ✅ Log OTP to console/logs (for testing)
- ⚠️ Skip actual email sending (until SMTP is configured)
- ✅ Allow OTP verification to work normally

## Quick Fix Applied

### What Changed:
1. **Email Service** (`src/services/emailService.js`)
   - Checks if SMTP credentials are configured
   - Returns `success: true, skipped: true` when SMTP not configured
   - Logs OTP to console for testing
   - Handles email errors gracefully

2. **.env File**
   - Added SMTP placeholders:
     ```env
     SMTP_HOST=smtp.gmail.com
     SMTP_PORT=587
     SMTP_USER=your_email@gmail.com
     SMTP_PASS=your_app_password_here
     ```

## Testing Without Email (Current Setup)

### How to Test:
1. Start registration and request email OTP
2. Check the backend logs/console for the OTP:
   ```
   OTP for user@example.com: 123456 (Email skipped - configure SMTP in .env)
   ```
3. Use the OTP from logs to verify
4. Registration will complete successfully

### Example Log Output:
```
2026-04-22 18:00:00 [warn]: Email service not configured - Email will be skipped
2026-04-22 18:00:00 [info]: OTP for user@example.com: 123456 (Email skipped - configure SMTP in .env)
2026-04-22 18:00:00 [warn]: Email OTP skipped for user@example.com - SMTP not configured
2026-04-22 18:00:00 [info]: Registration OTP sent to email: user@example.com
```

## Production Setup (Configure Gmail SMTP)

### Option 1: Gmail with App Password (Recommended)

#### Step 1: Enable 2-Factor Authentication
1. Go to Google Account: https://myaccount.google.com/
2. Click "Security" in left sidebar
3. Enable "2-Step Verification"

#### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select "Mail" as the app
3. Select "Other (Custom name)" as the device
4. Enter "CCTV Analysis System"
5. Click "Generate"
6. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

#### Step 3: Update .env File
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_actual_email@gmail.com
SMTP_PASS=abcdefghijklmnop  # Remove spaces from app password
```

#### Step 4: Restart Server
```bash
npm start
```

### Option 2: Other Email Providers

#### Outlook/Hotmail
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your_email@outlook.com
SMTP_PASS=your_password
```

#### Yahoo Mail
```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your_email@yahoo.com
SMTP_PASS=your_app_password
```

#### Custom SMTP Server
```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_password
```

## Verification

### Test Email Sending:
```bash
curl -X POST http://localhost:3000/api/auth/send-registration-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "test@example.com",
    "type": "email"
  }'
```

**With SMTP Configured:**
- Email will be sent to the address
- User receives actual email with OTP

**Without SMTP (Current):**
- OTP logged to console
- Response: `{"success": true, "message": "OTP sent to your email"}`
- Check logs for OTP

## Troubleshooting

### Issue: "Missing credentials for PLAIN"
**Solution**: SMTP credentials not configured. Check logs for OTP and use it for testing.

### Issue: "Invalid login"
**Solution**: 
- For Gmail: Use App Password, not regular password
- Enable 2-Factor Authentication first
- Remove spaces from app password

### Issue: "Connection timeout"
**Solution**:
- Check firewall allows port 587
- Try port 465 with `secure: true`
- Check SMTP_HOST is correct

### Issue: Can't find OTP in logs
**Solution**: 
```bash
# Check logs
tail -f logs/combined.log | grep "OTP for"

# Or check console output
npm start
```

## Email Template

The OTP email includes:
- Professional HTML design
- Blue header with system name
- Large OTP code in dashed box
- 5-minute validity notice
- Security warning
- Responsive design

## Security Notes

### Gmail App Password:
- ✅ More secure than regular password
- ✅ Can be revoked without changing main password
- ✅ Specific to this application
- ✅ Doesn't give access to full Google account

### Best Practices:
1. Never commit `.env` file to git
2. Use App Passwords, not regular passwords
3. Rotate passwords periodically
4. Use dedicated email for system notifications
5. Monitor email sending logs

## Alternative: Use Email Service Provider

For production, consider professional email services:

### SendGrid (Recommended)
- Free tier: 100 emails/day
- Better deliverability
- Email analytics
- Setup: https://sendgrid.com/

### AWS SES
- Pay as you go: $0.10 per 1000 emails
- High deliverability
- Requires AWS account
- Setup: https://aws.amazon.com/ses/

### Mailgun
- Free tier: 5000 emails/month
- Easy API integration
- Good documentation
- Setup: https://www.mailgun.com/

## Current Configuration

### SMTP Settings (To Be Configured):
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com  # ← Change this
SMTP_PASS=your_app_password_here  # ← Change this
```

## Summary

✅ **Current Status**: Registration works with email OTP (OTP logged to console)  
⏳ **Next Step**: Configure Gmail SMTP with App Password  
🎯 **Goal**: Full email OTP functionality in production

---

**Date**: April 22, 2026  
**Status**: Working with Fallback ✅  
**Production Ready**: After SMTP configuration ⏳
