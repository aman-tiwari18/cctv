/**
 * One-off test: send the "Account Verified" email to a single recipient, with NO CC.
 *
 * Usage (from cctv_backend/):
 *   node scripts/send_test_verification_mail.js
 *   node scripts/send_test_verification_mail.js someone@example.com
 *
 * The password in the mail is a dummy placeholder; no user/DB record is touched.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Empty value = copy nobody (see VERIFICATION_CC in emailService.js).
process.env.VERIFICATION_EMAIL_CC = '';

const { sendVerifiedCredentialsEmail } = require('../src/services/emailService');

const TO = process.argv[2] || 'Nikhil.Mishra@in.ey.com';

(async () => {
    const result = await sendVerifiedCredentialsEmail(TO, {
        name: 'Test User',
        username: TO,
        password: 'TEST-ONLY-1234',
        exams: ['UPCISB (14-16 OCT)'],
    });
    console.log(`To: ${TO} (no CC)`);
    console.log(JSON.stringify(result));
    process.exit(result.success && !result.skipped ? 0 : 1);
})();
