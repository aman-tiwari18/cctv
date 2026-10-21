# Standalone Email Test Script — Plan & Spec

Target location: `/home/umartheboss/Desktop/email_test/` (on the user's own machine; that path does not exist on the CCTV server).

## 1. Motive

We need a way to test the CCTV system's emails (Resend) without running the backend, the DB or anything else from the codebase. The tool must be:

- **Independent**: no `require` of anything under `cctv_backend/` (no logger, no `.env` of the backend, no DB).
- **Same behaviour**: same env keys, same sender format, same subject lines, same HTML templates, same Resend call shape. If it works here, it works in the backend.
- **Safe**: dummy data only, no user/DB record touched, CC off by default.

## 2. How the current flow works (read from the code)

Source: `cctv_backend/src/services/emailService.js`, used by `src/controllers/AuthController.js`.

```
AuthController  ──►  emailService.js  ──►  Resend SDK  ──►  Resend API  ──►  recipient inbox
 (line 291, 502,       sendOTPEmail           resend.emails.send({
  557, 623, 726,       sendRegistrationNotification   from, to[], cc[]?, subject, html })
  894)                 sendVerificationNotification
                       sendVerifiedCredentialsEmail
                          └─ all go through sendEmail()
```

1. **Config** (`process.env`): `RESEND_API_KEY` (required), `EMAIL_FROM`, `EMAIL_FROM_NAME`, `DASHBOARD_URL`, `VERIFICATION_EMAIL_CC`.
   (The `SMTP_*` keys in the backend `.env` are legacy and unused. Do not carry them over.)
2. **Client**: `new Resend(process.env.RESEND_API_KEY)`, created once at load only if the key exists.
3. **`FROM()`**: `` `${EMAIL_FROM_NAME} <${EMAIL_FROM}>` `` with defaults `Exam CCTV Monitoring` and `noreply@examscctvmonitoring.com`. The sender domain must be verified in Resend, otherwise sends fail.
4. **`sendEmail(to, subject, html, {cc})`**: never throws. It returns:
   - key missing → `{ success: true, skipped: true, message }` (treated as success, so check `skipped`)
   - Resend `error` → `{ success: false, message }`
   - ok → `{ success: true, messageId }`
   - `to` is wrapped into an array. `cc` is filtered for empties and only included if non-empty.
5. **`layout(title, bodyHtml)`**: shared HTML wrapper (blue `#1976d2` header "CCTV Analysis System", white content card, footer "automated email").
6. **`escapeHtml`**: used only by the credentials mail, for user-supplied values.
7. **Four email types**:

| Function | Subject | Notes |
|---|---|---|
| `sendOTPEmail(email, otp, purpose='verification'\|'reset')` | `Email Verification OTP - CCTV Analysis System` / `Password Reset OTP - CCTV Analysis System` | OTP box, "valid for 5 minutes" |
| `sendRegistrationNotification(email, name)` | `Registration Received - CCTV Analysis System` | pending admin approval |
| `sendVerificationNotification(email, name)` | `Your Account Has Been Verified - CCTV Analysis System` | simple "verified" badge |
| `sendVerifiedCredentialsEmail(email, {name, username, password, exams[]})` | `Account Verified - <exams joined by ", ">` (fallback text `the CCTV Analysis System`) | username + password table, dashboard URL, **CC list applied**. `password: null` → "your existing password for this account" |

8. **CC rule**: `VERIFICATION_EMAIL_CC` is comma-separated. If **unset**, the code falls back to `akpathak@iitk.ac.in` (`??`, so an **empty string means no CC**). The backend `.env` currently sets it to `amant@iitk.ac.in`. The credentials mail carries a password, so every CC address receives it too.
9. **Existing test script** (`cctv_backend/scripts/send_test_verification_mail.js`): forces `VERIFICATION_EMAIL_CC=''`, then sends the credentials mail with dummy data (`TEST-ONLY-1234`, exam `UPCISB (14-16 OCT)`) to argv[2] (default `Nikhil.Mishra@in.ey.com`). The new tool generalizes this.

## 3. Keys needed (`.env` in the new folder)

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx     # REQUIRED. Copy from cctv_backend/.env (line 58) or the Resend dashboard. Never commit/share it.
EMAIL_FROM=noreply@examscctvmonitoring.com     # must be on a domain verified in Resend
EMAIL_FROM_NAME=Exam CCTV Monitoring
DASHBOARD_URL=http://www.examscctvmonitoring.com/cctv_analytics/login
VERIFICATION_EMAIL_CC=                         # empty = no CC (safe default for tests). Comma-separated to test CC.
```

Ship `.env.example` with placeholders and add `.env` to `.gitignore`. The real key lives only in `.env`.

## 4. Planned structure

```
email_test/
├─ package.json          # deps: resend ^6.14.0, dotenv ^16.3.1  (the same versions as the backend)
├─ .env.example
├─ .gitignore            # .env, node_modules
├─ README.md             # 10-line usage
└─ src/
   ├─ config.js          # loads .env, exports FROM(), DASHBOARD_URL(), VERIFICATION_CC(), isConfigured()
   ├─ mailer.js          # sendEmail(): the Resend wrapper, same return contract; console.log instead of logger
   ├─ templates.js       # layout(), escapeHtml(), and the 4 template builders -> {subject, html}
   └─ cli.js             # argument parsing, picks template, calls mailer, prints result, exit code
```

Requires Node ≥ 18. The backend runs 20.

### Module contracts

- `config.js`: `require('dotenv').config()` from the script's own folder (`path.join(__dirname,'..','.env')`). Same defaults as the backend (see §2.3, §2.8).
- `mailer.js`: copy `sendEmail` verbatim. Replace `logger.*` with `console.*`. Create the Resend client lazily. Add a `--dry-run` path that prints the subject/to/cc and writes the HTML to `out/<type>.html` without calling Resend.
- `templates.js`: port the four functions, but have them **return `{subject, html}`** instead of sending. That separates rendering from sending and makes preview possible. Copy the CSS and HTML strings exactly from `emailService.js` lines 77-221. The subject strings must be identical to the table in §2.7.
- `cli.js`:

```
node src/cli.js <type> <to> [options]

type:  otp | reset | registered | verified | credentials
to:    recipient email (comma-separated allowed)

options:
  --name "Test User"
  --username <u>            (credentials; default = to)
  --password <p>            (credentials; default TEST-ONLY-1234; use --no-password to test the null case)
  --exams "A,B"             (credentials; default "UPCISB (14-16 OCT)")
  --otp 123456              (otp/reset; default random 6 digits)
  --cc a@x.com,b@y.com      (overrides VERIFICATION_EMAIL_CC; --no-cc forces none; default = env value)
  --dry-run                 (render only, no network)
```

Type mapping: `otp`→`sendOTPEmail(...,'verification')`, `reset`→`sendOTPEmail(...,'reset')`, `registered`→`sendRegistrationNotification`, `verified`→`sendVerificationNotification`, `credentials`→`sendVerifiedCredentialsEmail`. CC applies only to `credentials`, as in the backend.

Output: `To:`, `CC:` (or `none`), `Subject:`, then the JSON result. Exit 0 only if `success && !skipped` (matches the existing script). Print a loud warning if `skipped` (key missing).

## 5. Build steps

1. `mkdir email_test && cd email_test && npm init -y && npm i resend@^6.14.0 dotenv@^16.3.1`
2. Create `.env` from `.env.example` and paste in the real `RESEND_API_KEY`.
3. Write `config.js` → `templates.js` (copy the HTML verbatim) → `mailer.js` → `cli.js`.
4. Verify:
   - `--dry-run` for each of the 5 types. Open `out/*.html` in a browser and compare against the backend's HTML.
   - Send `credentials` to your own address with `--no-cc`. Check the inbox and spam. Check the From name/address and the subject.
   - Send with `--cc` to a second address and confirm CC delivery.
   - Unset `RESEND_API_KEY` → expect the `skipped` warning and exit code 1.
   - Use a bad key → expect `success:false` with the Resend error message.

## 6. Gotchas

- **Domain verification**: if `EMAIL_FROM`'s domain isn't verified in Resend, the send fails (403/validation error). That is a Resend-account issue, not a code issue.
- **Resend free/test limits**: with an unverified domain, Resend only delivers to the account owner's own address.
- **Spam**: HTML-only mail with no plain-text part may land in spam. The backend doesn't send a `text` part, and to stay faithful this tool doesn't either. An optional `--text` could be added later.
- **`skipped` is `success:true`** in the backend. The tool must check `skipped` explicitly (see §4 output rules).
- **Fallback CC address** `akpathak@iitk.ac.in` applies when `VERIFICATION_EMAIL_CC` is *unset*. In the test tool, default the env to empty (`VERIFICATION_EMAIL_CC=`) so tests never copy anyone by accident.
- **No password in logs**: don't print the full HTML or the password in normal output. Print only the To/CC/Subject/result.
- **Keep in sync**: if `emailService.js` templates change, re-port them. The tool is a copy by design (that's what "independent" means).

## 7. Out of scope

DB lookups, the OTP generation/expiry logic (the tool only renders a given OTP), the Node SMS bridge, and the legacy SMTP/nodemailer path.

---

# Appendix — Full reference code (copy as-is)

With this appendix the md is self-contained. Files below match the backend `emailService.js` (HTML, CSS, subjects, return shapes). Only `logger` → `console` and "send" → "render" differ.

## A1. `package.json`

```json
{
  "name": "email_test",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test:dry": "node src/cli.js credentials test@example.com --dry-run"
  },
  "dependencies": {
    "dotenv": "^16.3.1",
    "resend": "^6.14.0"
  }
}
```

## A2. `.env.example` and `.gitignore`

```
RESEND_API_KEY=re_replace_me
EMAIL_FROM=noreply@examscctvmonitoring.com
EMAIL_FROM_NAME=Exam CCTV Monitoring
DASHBOARD_URL=http://www.examscctvmonitoring.com/cctv_analytics/login
VERIFICATION_EMAIL_CC=
```

`.gitignore`:
```
.env
node_modules
out
```

## A3. `src/config.js`

```js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const FROM = () => {
    const addr = process.env.EMAIL_FROM || 'noreply@examscctvmonitoring.com';
    const name = process.env.EMAIL_FROM_NAME || 'Exam CCTV Monitoring';
    return `${name} <${addr}>`;
};

const DASHBOARD_URL = () =>
    process.env.DASHBOARD_URL || 'http://www.examscctvmonitoring.com/cctv_analytics/login';

// Comma-separated. Empty string => nobody. (Backend falls back to a hardcoded address when UNSET;
// the test tool deliberately defaults to nobody.)
const VERIFICATION_CC = () => {
    const raw = process.env.VERIFICATION_EMAIL_CC ?? '';
    return raw.split(',').map((a) => a.trim()).filter(Boolean);
};

const isConfigured = () => Boolean(process.env.RESEND_API_KEY);

module.exports = { FROM, DASHBOARD_URL, VERIFICATION_CC, isConfigured };
```

## A4. `src/mailer.js`

```js
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
const { FROM, isConfigured } = require('./config');

let resend = null;
const client = () => (resend ||= new Resend(process.env.RESEND_API_KEY));

/** Same contract as the backend: never throws. */
async function sendEmail(to, subject, html, { cc = [], dryRun = false, label = 'mail' } = {}) {
    const ccList = (Array.isArray(cc) ? cc : [cc]).filter(Boolean);
    const toList = Array.isArray(to) ? to : [to];

    if (dryRun) {
        const dir = path.join(__dirname, '..', 'out');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${label}.html`);
        fs.writeFileSync(file, html);
        return { success: true, dryRun: true, file };
    }

    if (!isConfigured()) {
        return { success: true, skipped: true, message: 'Email service not configured (RESEND_API_KEY missing).' };
    }

    try {
        const { data, error } = await client().emails.send({
            from: FROM(),
            to: toList,
            ...(ccList.length ? { cc: ccList } : {}),
            subject,
            html,
        });
        if (error) return { success: false, message: error.message || 'Failed to send email', error };
        return { success: true, messageId: data?.id };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

module.exports = { sendEmail };
```

## A5. `src/templates.js`

Each builder returns `{ subject, html }`.

```js
const { DASHBOARD_URL } = require('./config');

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function layout(title, bodyHtml) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8" />
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: white; padding: 30px; border-radius: 0 0 5px 5px; }
            .otp-box { background-color: #f0f0f0; border: 2px dashed #1976d2; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #1976d2; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .warning { color: #d32f2f; font-weight: bold; margin-top: 15px; }
            .badge { display: inline-block; background: #10b981; color: #fff; padding: 6px 14px; border-radius: 20px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header"><h1>CCTV Analysis System</h1></div>
            <div class="content">
                <h2>${title}</h2>
                ${bodyHtml}
                <p>Best regards,<br>CCTV Analysis Team</p>
            </div>
            <div class="footer">
                <p>This is an automated email. Please do not reply to this message.</p>
            </div>
        </div>
    </body>
    </html>`;
}

function otpEmail(otp, purpose = 'verification') {
    const subject = purpose === 'reset'
        ? 'Password Reset OTP - CCTV Analysis System'
        : 'Email Verification OTP - CCTV Analysis System';

    const intro = purpose === 'reset'
        ? 'You have requested to reset your password. Use the OTP below to proceed:'
        : 'Thank you for registering with CCTV Analysis System. Use the OTP below to verify your email address:';

    const html = layout(purpose === 'reset' ? 'Password Reset Request' : 'Email Verification', `
        <p>Hello,</p>
        <p>${intro}</p>
        <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <p style="margin: 10px 0 0 0; color: #666;">This OTP is valid for 5 minutes</p>
        </div>
        <p>If you didn't request this ${purpose === 'reset' ? 'password reset' : 'verification'}, please ignore this email.</p>
        <p class="warning">⚠️ Never share this OTP with anyone. Our team will never ask for your OTP.</p>
    `);
    return { subject, html };
}

function registrationEmail(name) {
    const html = layout('Registration Received', `
        <p>Hello ${name || 'there'},</p>
        <p>Your account has been created successfully with the CCTV Analysis System.</p>
        <p>Your registration is currently <strong>pending approval</strong> by an administrator.
           You will receive another email once your account has been verified and activated.</p>
    `);
    return { subject: 'Registration Received - CCTV Analysis System', html };
}

function verificationEmail(name) {
    const html = layout('Account Verified', `
        <p>Hello ${name || 'there'},</p>
        <p><span class="badge">✓ Verified</span></p>
        <p>Good news — your account has been verified and activated by an administrator.
           You can now log in and access the CCTV Analysis System.</p>
    `);
    return { subject: 'Your Account Has Been Verified - CCTV Analysis System', html };
}

function credentialsEmail(email, { name, username, password, exams = [] } = {}) {
    const list = (Array.isArray(exams) ? exams : [exams]).filter(Boolean);
    const examText = list.length ? list.join(', ') : 'the CCTV Analysis System';
    const url = DASHBOARD_URL();

    const passwordCell = password
        ? `<code style="font-size: 15px;">${escapeHtml(password)}</code>`
        : 'your existing password for this account';

    const html = layout('Account Verified', `
        <p>Hello ${escapeHtml(name || 'there')},</p>
        <p><span class="badge">&#10003; Verified</span></p>
        <p>You have been successfully registered for <strong>${escapeHtml(examText)}</strong>.</p>
        <p>Your account has been verified by an administrator. Use the credentials below to sign in:</p>
        <div class="otp-box" style="text-align: left; border-style: solid;">
            <table style="border-collapse: collapse;">
                <tr>
                    <td style="padding: 6px 0; width: 110px;"><strong>Username:</strong></td>
                    <td style="padding: 6px 0;">${escapeHtml(username || email)}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0;"><strong>Password:</strong></td>
                    <td style="padding: 6px 0;">${passwordCell}</td>
                </tr>
            </table>
        </div>
        <p><strong>Dashboard:</strong> <a href="${url}">${url}</a></p>
        <p class="warning">&#9888;&#65039; For your security, change your password after the first login and never share these credentials.</p>
    `);
    return { subject: `Account Verified - ${examText}`, html };
}

module.exports = { otpEmail, registrationEmail, verificationEmail, credentialsEmail };
```

## A6. `src/cli.js`

```js
const { sendEmail } = require('./mailer');
const { VERIFICATION_CC, FROM, isConfigured } = require('./config');
const T = require('./templates');

const argv = process.argv.slice(2);
const [type, toArg] = argv;
const flags = {};
for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; i++; }
}

const TYPES = ['otp', 'reset', 'registered', 'verified', 'credentials'];
if (!TYPES.includes(type) || !toArg) {
    console.error(`Usage: node src/cli.js <${TYPES.join('|')}> <to[,to2]> [--name N] [--username U] [--password P | --no-password]\n` +
        '       [--exams "A,B"] [--otp 123456] [--cc a@x,b@y | --no-cc] [--dry-run]');
    process.exit(2);
}

const to = toArg.split(',').map((s) => s.trim()).filter(Boolean);
const name = flags.name || 'Test User';
const dryRun = Boolean(flags['dry-run']);

let msg;
let cc = [];
switch (type) {
    case 'otp':
    case 'reset': {
        const otp = flags.otp || String(Math.floor(100000 + Math.random() * 900000));
        msg = T.otpEmail(otp, type === 'reset' ? 'reset' : 'verification');
        break;
    }
    case 'registered': msg = T.registrationEmail(name); break;
    case 'verified': msg = T.verificationEmail(name); break;
    case 'credentials': {
        msg = T.credentialsEmail(to[0], {
            name,
            username: flags.username || to[0],
            password: flags['no-password'] ? null : (flags.password || 'TEST-ONLY-1234'),
            exams: (flags.exams || 'UPCISB (14-16 OCT)').split(',').map((s) => s.trim()),
        });
        cc = flags['no-cc'] ? []
            : flags.cc ? String(flags.cc).split(',').map((s) => s.trim()).filter(Boolean)
            : VERIFICATION_CC();
        break;
    }
}

(async () => {
    if (!dryRun && !isConfigured()) console.warn('WARNING: RESEND_API_KEY missing — send will be SKIPPED.');
    console.log(`From:    ${FROM()}`);
    console.log(`To:      ${to.join(', ')}`);
    console.log(`CC:      ${cc.length ? cc.join(', ') : 'none'}`);
    console.log(`Subject: ${msg.subject}`);
    const result = await sendEmail(to, msg.subject, msg.html, { cc, dryRun, label: type });
    console.log(JSON.stringify(result));
    process.exit(result.success && !result.skipped ? 0 : 1);
})();
```

## A7. `README.md` (usage)

```
npm install
cp .env.example .env   # then set RESEND_API_KEY
node src/cli.js credentials you@example.com --no-cc            # real send
node src/cli.js otp you@example.com --otp 654321
node src/cli.js reset you@example.com --dry-run                # writes out/reset.html, no network
node src/cli.js credentials you@example.com --cc a@x.com,b@y.com
```
Exit code 0 = sent; 1 = failed or skipped (no API key); 2 = bad usage.
