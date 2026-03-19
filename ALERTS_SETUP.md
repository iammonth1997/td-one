# Security Alert System Setup Guide

> Real-time security alerts for authentication, device, and salary access events via Slack/Email.

## Quick Start

The security alert system monitors `security_audit_logs` and sends notifications when:
- **5+ failed logins in 15 min** → 🚨 CRITICAL
- **3+ unregistered device attempts in 1 hour** → ⚠️ WARNING
- **Salary accessed outside 7 AM–8 PM** → 🚨 CRITICAL  
- **2+ mock location detections in 1 hour** → ⚠️ WARNING
- **Account lock/unlock events** → ℹ️ INFO

---

## Setup Steps

### 1. Slack Webhook (Recommended)

#### Step 1a: Create Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name: `TD One Security Alerts`
4. Choose your workspace

#### Step 1b: Enable Incoming Webhooks
1. In the sidebar, go to **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks** ON
3. Click **Add New Webhook to Workspace**
4. Choose the channel (e.g., `#security-alerts`)
5. Click **Allow**
6. Copy the webhook URL (looks like `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXX`)

#### Step 1c: Deploy Webhook URL
Add to your `.env` or hosting platform:
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXX
```

**Test Slack Integration:**
```bash
curl -X POST https://yourdomain.com/api/security/alerts/process \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

You should see a test alert in Slack within seconds.

---

### 2. Email Alerts (Optional)

Email alerts require **SMTP** configuration. Typical setup:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # NOT your regular password; use Gmail App Password
ALERT_EMAIL_TO=security@company.com,admin@company.com
```

> **Note:** Email sending is logged but not fully implemented in v1.0. Slack is the primary channel.

---

### 3. Automated Cron Job (Recommended)

To run alerts every 5 minutes:

#### For Vercel Cron
Update `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/security/alerts/process",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Add to `.env`:
```bash
CRON_SECRET=your-unique-secret-key-min-32-chars
```

#### For External Scheduler (AWS, Google Cloud, etc.)
Call your endpoint every 5 minutes with:
```bash
curl -X POST https://yourdomain.com/api/security/alerts/process \
  -H "x-cron-secret: your-unique-secret-key-min-32-chars" \
  -H "Content-Type: application/json"
```

---

### 4. Manual Trigger (For Testing)

Admins can trigger alerts manually:

```bash
curl -X POST https://yourdomain.com/api/security/alerts/process \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "processed": 2,
  "alerts_sent": 1,
  "message": "Processed 2 alert events, sent 1 notifications",
  "config": "✅ Alert system ready [Slack]"
}
```

---

### 5. Check Alert Status

```bash
curl https://yourdomain.com/api/security/alerts/status \
  -H "Authorization: Bearer ADMIN_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

Response shows:
- Active configurations (Slack, Email, Cron)
- Alerts sent in last 24 hours
- Available endpoints

---

## Alert Rules (Customizable)

Edit `remix-app/app/lib/alert.server.ts` to modify rules:

```typescript
const ALERT_RULES: AlertRule[] = [
  {
    name: "MULTIPLE_LOGIN_FAILURES",
    severity: "critical",
    query: {
      eventTypes: ["LOGIN_FAILED"],
      withinMinutes: 15,
      threshold: 5,  // ← Change this number
    },
    // ...
  },
  // Add more rules here
];
```

---

## Deduplication (1 alert per rule per employee per hour)

The system tracks sent alerts in `security_alerts_sent` table to prevent spam:

```sql
-- View recent alerts sent
SELECT rule_name, emp_id, severity, sent_at 
FROM security_alerts_sent 
WHERE sent_at > now() - interval '24 hours'
ORDER BY sent_at DESC;
```

---

## Slack Message Format

Alerts in Slack show:
- **Severity icon** (🚨/⚠️/ℹ️)
- **Event count** and **time window**
- **Affected employee** ID
- **Timestamp** and **rule name**
- **Color-coded** severity (red/orange/blue)

Example:
```
🚨 Security Alert - CRITICAL
🚨 CRITICAL: 5 failed login attempts in 15 minutes for EMP001

Rule: MULTIPLE_LOGIN_FAILURES
Time: 2024-01-15T10:30:45Z
Employee: EMP001
```

---

## Monitoring & Metrics

### Key Metrics to Track
1. **Alerts sent per 24h** — Check `/api/security/alerts/status`
2. **False positive rate** — Compare suspicious events vs. actual breaches
3. **Alert latency** — Should be < 5 minutes from event to notification
4. **Deduplication ratio** — Events processed vs. alerts sent

### Log Monitoring
Check application logs for:
```
[alert] Sent MULTIPLE_LOGIN_FAILURES alert for EMP001
[alert] Slack send failed: [error details]
[alert] SMTP not fully configured
```

---

## Troubleshooting

### Alerts Not Sending
1. **Check config status:**
   ```bash
   curl https://yourdomain.com/api/security/alerts/status \
     -H "Authorization: Bearer ADMIN_TOKEN"
   ```

2. **Verify Slack webhook:**
   - Go to Slack app settings
   - Check webhook status (should show "Success")
   - Regenerate if needed

3. **Check logs for errors:**
   - Look for `[alert]` prefix in application logs
   - Common issues: Network timeout, invalid webhook URL

4. **Test endpoint manually:**
   - Call `/api/security/alerts/process` with admin token
   - Should return `alerts_sent: X` (X might be 0 if no recent breaches)

### Too Many Alerts
- Increase `withinMinutes` or `threshold` in alert rules
- Adjust deduplication window (currently 1 hour per employee)
- Reduce alert severity levels (hide "info" severity in Slack)

### Cron Not Running
- Verify `vercel.json` has `crons` section
- Check `CRON_SECRET` is set and matches the header
- View Cron Invocations in Vercel dashboard

---

## Security Best Practices

### Protect Sensitive Data
- **Webhook URLs** → Store in secrets manager, never in git
- **Cron secret** → Use strong random string (32+ chars)
- **SMTP credentials** → Use app-specific passwords, not main credentials

### Slack Channel Security
1. Create **private channel** for alerts (not public)
2. Restrict members to: IT, HR Payroll, Admin only
3. Enable **channel encryption** if available
4. Disable **external forwarding** of alerts

### Email Recipients
- Only send to company email addresses
- Never forward alerts to external services
- Use BCC for multi-recipient emails (not CC)

---

## Database Migration

The alert system requires the `security_alerts_sent` table:

```bash
# Run migration 019
psql -d your_db -f migrations/019_create_security_alerts_table.sql
```

Or use Supabase SQL editor to run `migrations/019_create_security_alerts_table.sql`.

---

## Future Enhancements

- [ ] Dashboard to review recent alerts
- [ ] SMS alerts for critical events
- [ ] Custom alert rules via admin UI
- [ ] Alert escalation (email → oncall → manager)
- [ ] Integration with SIEM (Splunk, Datadog, etc.)
- [ ] Machine learning to detect anomalies
- [ ] Rate limiting per Slack channel (prevent webhook timeout)

---

## Support

For issues, check:
1. Application logs (error/warning messages)
2. Slack app activity in [api.slack.com/logs](https://api.slack.com/logs)
3. Database `security_alerts_sent` table (recent activity)
4. Cron job execution history (Vercel/Cloud Provider dashboard)

---

**Last Updated:** 2024-01-15  
**Version:** 1.0  
**Status:** Production Ready
