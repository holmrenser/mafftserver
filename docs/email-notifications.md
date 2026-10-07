# Email notifications

Status as of this writing: **implemented, disabled by default, not verified against a
real mail provider.** The "email me when this job finishes" field on the submission
form is disabled in the UI with a note explaining why, and the API rejects a
`notifyEmail` value outright if SMTP isn't configured - there is no code path where a
user can ask for an email and silently not get one because the server just didn't try.

## What's implemented

- **`src/lib/email.ts`** - the whole feature. `isEmailConfigured()` is `true` only when
  `SMTP_HOST` is set; `sendJobNotification()` sends via [nodemailer](https://nodemailer.com/)
  using `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`, and
  `buildJobNotification()` is the pure subject/body builder (unit-tested in
  `test/unit/email.test.ts`) linking back to `APP_URL/jobs/<id>`.
- **Schema**: `MafftJob.notifyEmail` (nullable `String`) - the address, if any, stored
  at submission time. Deliberately excluded from the job-id hash (`src/lib/hash.ts`):
  it's per-submission metadata, not part of what makes two submissions "the same job".
  (A consequence: resubmitting an already-finished job with a new address doesn't send
  that address anything - the job dedupes and never runs again.)
- **Where it's sent from**: the worker, not the app - `worker/processors/mafft.ts`
  sends a "completed" notification right after a successful run persists its results;
  `worker/mafftworker.ts`'s `recordFailure` callback sends a "failed" notification
  once retries are exhausted (not on every retry attempt - only the final, terminal
  failure). A send failure is logged and swallowed; it can never fail the job itself.
- **Three layers refusing to pretend this works when it doesn't**, all driven by the
  single `isEmailConfigured()` check:
  1. `src/app/page.tsx` calls it server-side and passes the result to
     `JobSubmissionForm` as `emailEnabled` - the input is `disabled` and shows "Email
     notifications aren't configured on this server yet" when false.
  2. `POST /api/submit` rejects the request with a 400 if a `notifyEmail` value is
     present but `isEmailConfigured()` is false - a direct API call can't get further
     than the UI can.
  3. `sendJobNotification()` itself checks again and `console.warn`s (not a silent
     return) if it's ever called without SMTP configured - this should be unreachable
     given the two guards above, so hitting it means something wrote a `notifyEmail`
     some other way (e.g. directly in the database) and is worth knowing about.
- **Verification status**: this is a direct port of iqtreeserver's implementation,
  which was checked end-to-end against a local fake SMTP server (both the completed and
  failed paths). **mafftserver's copy has not been sent through any SMTP server yet** -
  only the subject/body builder is unit-tested here. Neither copy has been tested
  against a real provider (auth, TLS, rate limits, SPF/DKIM/DMARC are all unverified).

## What needs to happen to turn it on

1. Get SMTP credentials from somewhere. Any of these work, since this is just
   nodemailer talking SMTP - it doesn't assume a specific provider:
   - An institutional/organizational SMTP relay (the kind of thing IT departments run
     for outbound mail).
   - A transactional email provider's SMTP endpoint (e.g. Mailgun, SES, Postmark,
     SendGrid, Resend) - typically the easiest path if there's no in-house relay,
     usually has a free tier sufficient for a low-volume job-notification use case.
   - A personal/team mailbox's SMTP (e.g. Gmail with an app password) - fine for
     testing, not recommended for production sending volume or deliverability.
2. Set these environment variables wherever the **worker** runs (the app doesn't
   strictly need them - only the worker sends mail - but `docker-compose.yml` passes
   them to both services for simplicity):
   ```
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587              # 465 for implicit TLS, 587 for STARTTLS (most common)
   SMTP_SECURE=false          # true only for port 465 / implicit TLS
   SMTP_USER=...              # omit both USER and PASS for an auth-not-required relay
   SMTP_PASS=...
   SMTP_FROM="mafftserver <no-reply@your-domain.example>"
   APP_URL=https://your-actual-domain.example   # used to build the link in the email
   ```
   See `.env.example` for the same list with inline comments.
3. That's it - no code or UI change needed. `isEmailConfigured()` flips to `true` the
   moment `SMTP_HOST` is set, which re-enables the form field and stops the API from
   rejecting `notifyEmail`, automatically, on the next request.
4. Before trusting it in production, send yourself a real test job and confirm the
   email actually arrives (not just that the worker logged no error) - deliverability
   problems (landing in spam, SPF/DKIM misconfiguration, a provider silently dropping
   the message) won't show up as an error in `nodemailer` or in this app's logs.

## If you want to test locally without real credentials

A local fake SMTP server is enough to confirm the *plumbing* (this is how
iqtreeserver's copy was verified):

```bash
npm install --no-save smtp-server mailparser
```

Then run a minimal SMTP listener on `127.0.0.1:2525` that dumps whatever it receives,
and set `SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_SECURE=false` for the worker. This
proves the app/worker/email code path end-to-end; it does not prove anything about a
real provider's behavior (see the verification caveat above).
