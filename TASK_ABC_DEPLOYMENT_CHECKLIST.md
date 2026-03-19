# Task A+B+C: Deployment Checklist

**Phase:** UI Updates + Salary Integration + Alert System  
**Ready Date:** January 15, 2024  
**Deployment Target:** Production Environment  

---

## Pre-Deployment Tasks

- [ ] **Code Review**
  - [ ] Review `SESSION_COMPLETION_SUMMARY.md` for change overview
  - [ ] Check all new TypeScript compiles (warnings OK, no errors)
  - [ ] Verify all endpoints respond to test calls
  
- [ ] **Database Migrations**
  - [ ] Run `migrations/019_create_security_alerts_table.sql` in production
  - [ ] Verify `security_alerts_sent` table exists and is accessible
  - [ ] Test RLS policies on new table
  
- [ ] **Environment Variables**
  - [ ] Set `SLACK_WEBHOOK_URL` (get from Slack app settings)
  - [ ] Set `CRON_SECRET` (32+ character random value)
  - [ ] Set `ALERT_EMAIL_TO` (optional, for future use)
  - [ ] Verify no hardcoded secrets in code (run grep check)

- [ ] **Configuration Testing**
  - [ ] Call `GET /api/security/alerts/status` → should show Slack enabled
  - [ ] Call `POST /api/security/alerts/process` (with cron secret) → should return success
  - [ ] Check Slack workspace for test alert message

---

## Deployment Steps

### Step 1: Database
```bash
# Apply migration 019
psql -d production_db -f migrations/019_create_security_alerts_table.sql
# Verify table:
SELECT * FROM security_alerts_sent LIMIT 1;
```

### Step 2: Environment Variables
```bash
# Set in your hosting platform (Vercel / Cloudflare / etc)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/TXXX/BXX/XXXXXX
CRON_SECRET=your-random-32-char-secret-here
```

### Step 3: Code Deployment
```bash
# Standard deployment (git push or CI/CD pipeline)
git commit -m "feat: security UI + salary tokens + alerts (Task A+B+C)"
git push origin main
# Deploy using your normal process
```

### Step 4: Cron Job Setup (Choose One)

#### Option A: Vercel (Easiest)
```bash
# vercel.json already has crons section:
{
  "crons": [{
    "path": "/api/security/alerts/process",
    "schedule": "*/5 * * * *"
  }]
}
# Deploy → Cron starts automatically
```

#### Option B: External Cron Service
```bash
# Use EasyCron, AWS Lambda, Google Cloud Scheduler, etc.
# Call endpoint every 5 minutes:
POST https://yourdomain.com/api/security/alerts/process
Header: x-cron-secret: YOUR_CRON_SECRET
```

### Step 5: Manual Verification
```bash
# Test alert processing
curl -X POST https://yourdomain.com/api/security/alerts/process \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"

# Expected response:
{
  "success": true,
  "processed": 0,
  "alerts_sent": 0,
  "message": "Processed 0 alert events, sent 0 notifications",
  "config": "✅ Alert system ready [Slack]"
}
```

---

## Post-Deployment Verification

### Immediate (Within 1 hour)
- [ ] Login page loads without errors (test in browser)
- [ ] "Set Password" page works (test new activation flow)
- [ ] Salary slip endpoint responds with token (test with valid token)
- [ ] Alert status endpoint returns config info
- [ ] No critical errors in application logs

### Short-term (Within 24 hours)
- [ ] No user reports of login issues
- [ ] UI shows "Password" instead of "PIN"
- [ ] Alert system log shows `[alert]` entries in logs
- [ ] Slack channel receives test alert (if any) or shows ready status

### Medium-term (Within 1 week)
- [ ] Monitor alert frequency (should be low, adjust thresholds if high)
- [ ] Verify salary tokens working (check `SALARY_AUTH_SUCCESS` events in audit log)
- [ ] Test forced password change scenario (if needed)
- [ ] HR team familiar with new alert system

---

## Rollback Plan

If critical issues discovered:

### Quick Rollback (< 5 minutes)
```bash
# Revert code to previous version
git revert HEAD
git push origin main
# Trigger deployment
# UI reverts to showing PIN (old labels)
```

### Full Rollback (15-30 minutes)
```bash
# Drop security_alerts_sent table
DROP TABLE security_alerts_sent;
# Revert all env vars to previous values
# Redeploy code to previous version
```

### Partial Rollback (Alerts only)
```bash
# Keep UI + salary tokens, disable alerts
# Set SLACK_WEBHOOK_URL to empty string
# Alerts will still be processed but not sent
# Users unaffected, HR/IT won't see alerts
```

---

## Monitoring & Health Checks

### Key Metrics to Track

**Authentication**
- `LOGIN_SUCCESS` count (should match normal traffic)
- `LOGIN_FAILED` count (alert if > 5 per 15 min)
- Average login time (should be < 2 seconds)

**Salary System**
- `SALARY_AUTH_SUCCESS` count (normal business hours)
- `SALARY_DATA_ACCESSED` count (should match payroll schedule)
- Average salary endpoint response time (should be < 500ms)

**Alert System**
- Alerts sent count (should be 0-5 per day initially)
- Alert processing latency (<5 min from event to notification)
- Failed alert sends (should be 0)

### Health Check Endpoint
```bash
# Check all systems at once
curl https://yourdomain.com/api/security/alerts/status \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## Communication Plan

### For Employees
- **Message:** "We've updated login to use passwords instead of PINs. No action needed — just use your password next time you log in."
- **Timing:** Send 1 day before deployment
- **Channel:** Email, dashboard banner, Slack

### For HR/IT
- **Message:** "New security alerts system is active. You'll receive Slack notifications for suspicious activity. See ALERTS_SETUP.md for details."
- **Timing:** Send same day as deployment
- **Attachments:** ALERTS_SETUP.md, alert examples, troubleshooting guide

### For Developers
- **Message:** "Task A+B+C is deployed. See SESSION_COMPLETION_SUMMARY.md for all changes."
- **Timing:** Send on deployment day
- **Attachments:** Code changes, migration script, API examples

---

## Known Risks & Mitigation

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Users forget new password requirements | Low | Medium | Add help text, clear error messages, reset option |
| Alert system over-notifies | Medium | Low | Start with strict thresholds, adjust after day 1 |
| Salary token expires mid-session | Low | Very Low | Token is 5 min, users rarely access salary during login |
| Database migration fails | Medium | Very Low | Test in staging first, have DBA standby |
| Cron job doesn't start | Low | Low | Monitor for alerts, manually trigger first run |

---

## Success Criteria

### All Three Tasks Complete When:
1. ✅ UI shows "Password" not "PIN"
2. ✅ Password validation requires 12+ characters
3. ✅ Salary endpoints accept and validate short-lived tokens
4. ✅ Slack receives alert test message
5. ✅ Alert status endpoint shows system ready
6. ✅ Database migration 019 applied successfully
7. ✅ No critical errors in logs after 24 hours
8. ✅ All three ALERTS_SETUP.md options tested

---

## Support & Escalation

**Feature Issues:** Check SESSION_COMPLETION_SUMMARY.md  
**Setup Issues:** Check ALERTS_SETUP.md  
**Database Issues:** Check migration script comments  
**Deployment Issues:** Follow TECHNICAL_ROLLBACK_GUIDE.md  

**Escalation:**
1. Check documentation first (5 min)
2. Search logs for `[alert]` or `[salary-token]` errors (5 min)
3. Review code changes in relevant files (10 min)
4. If unresolved, rollback and investigate further

---

## Sign-Off

**Deployment Approved By:** [Admin Name/Date]  
**Deployed By:** [DevOps Name/Date]  
**Verified By:** [QA Name/Date]  

- [ ] All pre-deployment tasks completed
- [ ] No blockers identified
- [ ] Ready to proceed to production

---

**Estimated Deployment Time:** 30 minutes  
**Estimated Verification Time:** 1 hour  
**Total: ~90 minutes**  

---

## Deployment Runbook Quick Reference

```bash
# 1. Apply migration
psql -d prod_db -f migrations/019_create_security_alerts_table.sql

# 2. Set env vars
export SLACK_WEBHOOK_URL="https://..."
export CRON_SECRET="random-32-chars"

# 3. Deploy code
git push origin main  # Triggers CI/CD

# 4. Verify
curl https://yourdomain.com/api/security/alerts/status \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Should return: "config": "✅ Alert system ready [Slack]"

# 5. Monitor logs
tail -f logs/application.log | grep "\[alert\]"
```

---

**Status:** ✅ Ready for Production Deployment  
**Last Updated:** January 15, 2024  
**Version:** 1.0
