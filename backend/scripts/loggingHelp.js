/*
 * StagePass logging command cheat-sheet.
 * Run locally or on Ubuntu: npm run logs:help
 */

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.LOG_TIMEZONE || "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

console.log(`
STAGEPASS LOGGING GUIDE
=======================

Winston log folder
------------------
ssh -i D:\stagepass-key.pem ubuntu@13.235.80.159

backend/logs/
  combined-YYYY-MM-DD.log  all application, request, warning, and error logs
  error-YYYY-MM-DD.log     error-level logs only

Files are created daily, rotate automatically, and are retained for 14 days.
Today's expected filenames: combined-${today}.log and error-${today}.log

PRODUCTION (Ubuntu / EC2)
-------------------------
1) Find the PM2 process and exact backend path
   pm2 status
   pm2 describe stagepass-backend

2) Watch readable live PM2 logs
   pm2 logs stagepass-backend
   pm2 logs stagepass-backend --lines 100

3) Read Winston files (first enter the backend folder)
   cd /var/www/stagepass/backend
   ls -lah logs
   tail -f logs/combined-$(date +%F).log
   tail -f logs/error-$(date +%F).log
   tail -n 100 logs/combined-$(date +%F).log

4) If you are already INSIDE backend/logs, do NOT write logs/ again
   tail -f combined-$(date +%F).log
   tail -n 100 error-$(date +%F).log

5) Trace a reported request using its x-request-id
   grep "REQUEST_ID_HERE" logs/combined-*.log
   grep "REQUEST_ID_HERE" logs/error-*.log

COMMON INVESTIGATIONS
---------------------
Login/auth:     grep "/api/auth/login" logs/combined-*.log
Stripe/payment: grep -i "stripe\\|checkout\\|webhook" logs/error-*.log
MongoDB/DNS:    grep -i "mongo\\|ENOTFOUND\\|ReplicaSet" logs/error-*.log
Email/SMTP:     grep -i "email\\|smtp" logs/error-*.log
Scheduler:      grep "[Scheduler]" logs/combined-*.log

PAYMENT INCIDENT TRACE
----------------------
Every payment stage now writes "domain":"payment" and the same Stripe
Checkout Session ID. Start with the session ID from Stripe Dashboard, a buyer
screenshot, or the booking document:

  grep '"stripeSessionId":"cs_test_OR_cs_live_HERE"' logs/combined-*.log
  grep '"bookingId":"BOOKING_ID_HERE"' logs/combined-*.log
  grep '"confirmationCode":"BK-..."' logs/combined-*.log

For a live readable view while reproducing an issue:
  tail -f logs/combined-$(date +%F).log | grep --line-buffered 'Payment trace'

Typical successful order timeline:
  checkout-created -> stripe-webhook-received -> stripe-payment-completed
  -> confirmation-started -> booking-confirmed -> confirmation-email-sent
  -> cart-cleared-after-payment

Failure signals to look for:
  checkout-create-failed, confirmation-payment-not-paid,
  confirmation-rejected-expired, stripe-webhook-failed,
  confirmation-email-failed, payment-reminder-failed,
  booking-hold-released

HOW TO READ A REQUEST
---------------------
200/201 = success
204     = success with no response body (often CORS OPTIONS preflight)
304     = browser cache reused; normal
400     = invalid request data
401     = login/token missing or invalid
403     = authenticated user lacks access to the organization/resource
404     = route/resource missing; public servers also receive harmless bot scans
429     = rate limit reached
500     = backend/integration error; check error-YYYY-MM-DD.log using requestId

MAINTENANCE
-----------
Winston automatically removes files older than 14 days. Do not delete audit JSON files.
Weekly disk check: df -h
Log folder size:  du -sh /var/www/stagepass/backend/logs
PM2 health:      pm2 status
PM2 restarts:    pm2 describe stagepass-backend

`);
