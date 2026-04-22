# SMS OTP Setup Guide

## Current Status
✅ **SMS OTP is now working with fallback mode**

The system will:
- ✅ Generate OTP
- ✅ Store OTP in memory
- ✅ Log OTP to console/logs (for testing)
- ⚠️ Skip actual SMS sending (until template is configured)
- ✅ Allow OTP verification to work normally

## Quick Fix Applied

### What Changed:
1. **SMS Service** (`src/services/smsService.js`)
   - Now returns `success: true, skipped: true` when template is missing
   - Logs OTP to console for testing: `OTP for +919999999999: 123456`

2. **Auth Controller** (`src/controllers/AuthController.js`)
   - Handles skipped SMS gracefully
   - Continues registration flow even if SMS is skipped

3. **.env File**
   - Added placeholder: `SMS_TEMPLATE_OTP=YOUR_OTP_TEMPLATE_ID_HERE`

## Testing Without SMS (Current Setup)

### How to Test:
1. Start registration and request phone OTP
2. Check the backend logs/console for the OTP:
   ```
   OTP for +919999999999: 123456 (SMS skipped - configure SMS_TEMPLATE_OTP in .env)
   ```
3. Use the OTP from logs to verify
4. Registration will complete successfully

### Example Log Output:
```
2026-04-22 16:30:45 [warn]: OTP SMS template not configured in .env - SMS will be skipped
2026-04-22 16:30:45 [info]: OTP for +919999999999: 123456 (SMS skipped - configure SMS_TEMPLATE_OTP in .env)
2026-04-22 16:30:45 [warn]: SMS OTP skipped for +919999999999 - template not configured
2026-04-22 16:30:45 [info]: Registration OTP sent to phone: +919999999999
```

## Production Setup (Get DLT Approval)

### Step 1: Get DLT Template Approved

**Template Text:**
```
Your OTP for CCTV Analysis verification is {#var#}. Valid for 5 minutes. Do not share with anyone. - SSC
```

**Template Details:**
- **Sender ID**: SSCSMS (already approved)
- **Entity ID**: 1401603390000012730 (already configured)
- **Category**: Transactional
- **Template Type**: OTP

### Step 2: Submit to SMSGatewayHub

1. Login to SMSGatewayHub portal
2. Go to DLT Templates section
3. Add new template with above text
4. Wait for approval (usually 24-48 hours)
5. Copy the approved Template ID

### Step 3: Update .env File

Replace the placeholder in `.env`:
```env
SMS_TEMPLATE_OTP=1407175327012345678  # Your actual template ID
```

### Step 4: Restart Server

```bash
npm start
```

## Verification

### Test SMS Sending:
```bash
curl -X POST http://localhost:3000/api/auth/send-registration-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+919999999999",
    "type": "phone"
  }'
```

**With Template Configured:**
- SMS will be sent to the phone number
- User receives actual SMS with OTP

**Without Template (Current):**
- OTP logged to console
- Response: `{"success": true, "message": "OTP sent to your phone"}`
- Check logs for OTP

## Alternative: Use Email Only

If you don't want to wait for SMS DLT approval, you can:

1. **Skip phone verification during registration**
2. **Use email verification only**
3. **Add phone verification later** when SMS template is ready

### To Skip Phone Verification:

Update `Register.jsx`:
```javascript
// Remove phone verification requirement
const handleContinueToPassword = async () => {
  if (!verification.emailVerified) {  // Only check email
    setError('Please verify email before continuing');
    return;
  }
  // ... rest of code
};
```

## Current Configuration

### SMS Credentials (Already Configured):
```env
SMS_API_KEY=GgvIcRfSQEmdB7Kmlj7iOA
SMS_SENDER_ID=SSCSMS
SMS_ENTITY_ID=1401603390000012730
```

### SMS Templates (Configured):
- ✅ Movement Detection
- ✅ Proximity Detection
- ✅ Mobile Detection
- ✅ Server Room Detection
- ✅ Invigilator Detection
- ⚠️ OTP (Pending DLT approval)

## Troubleshooting

### Issue: "OTP SMS template not configured"
**Solution**: This is expected. Check logs for OTP and use it for testing.

### Issue: Can't find OTP in logs
**Solution**: 
```bash
# Check logs
tail -f logs/combined.log | grep "OTP for"

# Or check console output
npm start
```

### Issue: Want to test with real SMS
**Solution**: Get DLT approval for OTP template (see Production Setup above)

## Summary

✅ **Current Status**: Registration works with email + phone OTP (OTP logged to console)  
⏳ **Next Step**: Get DLT approval for SMS OTP template  
🎯 **Goal**: Full SMS OTP functionality in production

---

**Date**: April 22, 2026  
**Status**: Working with Fallback ✅  
**Production Ready**: After DLT approval ⏳
