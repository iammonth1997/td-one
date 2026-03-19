# Admin Feature Enablement Guide

**Version:** 1.0  
**Date:** 2026-03-19  
**Audience:** HR Manager, IT Admin, System Administrator  

---

## Overview

After security architecture upgrade, the system has 5 new admin capabilities:

1. **Device Management** — Manage employee devices (register, deactivate, wipe)
2. **Employee Onboarding** — Generate activation codes for new employees
3. **Session Revocation** — Force logout specific devices or all devices
4. **Audit Logging** — View all authentication & security events
5. **Salary Access Control** — Track who accessed salary data and when

---

## 1. Device Management

### Where: Admin Dashboard → Device Management

**Use Case:** Employee loses phone, needs to reset access to old device

#### List All Devices for an Employee
```
GET /api/admin/devices?emp_id=EMP001
Authorization: Bearer [Admin Session Token]

Response:
{
  "devices": [
    {
      "id": "device-uuid-1",
      "device_id": "android-device-123",
      "device_name": "Samsung Galaxy A54",
      "platform": "android",
      "app_version": "1.2.3",
      "registered_at": "2026-02-15T10:30:00Z",
      "last_active_at": "2026-03-19T14:22:15Z",
      "is_active": true
    },
    {
      "id": "device-uuid-2",
      "device_id": "web-device-456",
      "device_name": "Desktop Chrome",
      "platform": "web",
      "registered_at": "2026-03-01T09:15:00Z",
      "last_active_at": "2026-03-18T08:45:00Z",
      "is_active": true
    }
  ]
}
```

#### Deactivate Single Device
```
POST /api/admin/devices
Authorization: Bearer [Admin Session Token]

Body:
{
  "action": "deactivate",
  "emp_id": "EMP001",
  "device_id": "android-device-123",
  "reason": "Employee reported lost phone"
}

Response:
{
  "success": true,
  "action": "deactivate",
  "device_id": "android-device-123"
}
```

**Result:** 
- Device marked `is_active = false`
- All sessions on that device revoked
- Employee receives "Device deactivated" message next time they try to login on that device
- Audit log event: `DEVICE_DEACTIVATED`

#### Emergency Wipe: Deactivate ALL Devices
```
POST /api/admin/devices
Authorization: Bearer [Admin Session Token]

Body:
{
  "action": "deactivate_all",
  "emp_id": "EMP001",
  "reason": "Phone lost - emergency remote wipe"
}

Response:
{
  "success": true,
  "action": "deactivate_all"
}
```

**Result:**
- ALL devices for employee deactivated
- ALL sessions revoked (forced logout everywhere)
- Employee must login fresh on ANY device (system will register as device #1 again)
- Audit log event: `DEVICE_ALL_DEACTIVATED` with `is_alert: true` & `severity: critical`
- Admin team notified (if alert channel configured)

**Permission:** `admin`, `super_admin`, `hr_manager`, `hr_payroll`

---

## 2. Employee Onboarding

### Where: Admin Dashboard → HR Tools → Employee Onboarding

**Use Case:** New employee joins, HR needs to give them access to app

#### Step 1: Generate Activation Code (HR does this)

```
POST /api/admin/activation-code
Authorization: Bearer [HR Session Token]

Body:
{
  "emp_id": "EMP999"
}

Response:
{
  "activation_code": "48372956",
  "expires_at": "2026-03-22T10:30:00Z",
  "note": "Share this code directly with the employee. It expires in 72 hours and cannot be retrieved again."
}
```

**What happens:**
- HR **writes down or shares the 8-digit code** (48372956)
- Code is valid for 72 hours
- Code cannot be re-retrieved (only expires and invalidates)
- Any previous codes for this employee are invalidated

**Rules:**
- Number only, 8 digits
- Cannot be: 00000000, 11111111, 12345678, etc. (weak patterns blocked)
- Single-use (becomes invalid after first use)
- If user enters wrong code 5 times → code auto-locked (HR must generate new code)

#### Step 2: Employee Uses Code (Employee does this on their phone)

```
POST /api/login/activate
Content-Type: application/json

Body:
{
  "emp_id": "EMP999",
  "activation_code": "48372956",
  "password": "MySecurePassphrase2026!",
  "device_id": "unique-device-id-or-uuid",
  "device_name": "iPhone 15",
  "platform": "ios"
}

Response:
{
  "success": true,
  "role": "employee",
  "login_context": "employee_portal"
  
  Set-Cookie: tdone_session_token=...; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
}
```

**What happens:**
- Employee enters their emp_id + phone (via employee ID input)
- Enters 8-digit code (from HR)
- Sets initial password (min 12 chars, any Unicode, no composition rules)
- App provides device registration (optional but recommended: device_id, device_name)
- Account activated → auto-login → session for 30 days
- First device auto-registered (can register up to 2 total per employee)

**Employee Requirements:**
- Password >= 12 characters
- For example: "ฉันอยากเทพนักงาน1234" (Thai, 21 chars) ✅
- For example: "MyPassW0rd" (10 chars) ❌
- No restrictions on: uppercase, lowercase, numbers, special chars
- Common pattern blocker: password cannot be > 50% the same char repeated

#### HR Workflow: Bulk Onboarding
```
For each new employee in batch:
1. POST /api/admin/activation-code with emp_id
2. Write codes in spreadsheet
3. Send codes to employees via secure channel (email with encryption, or physical)
4. Track in HR system who has used codes (query employee_activations table)

SELECT 
  emp_id,
  is_used,
  is_invalidated,
  failed_attempts,
  used_at
FROM employee_activations
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

**Permission:** `admin`, `super_admin`, `hr_manager`, `hr_payroll`

---

## 3. Session Revocation (for forcing password change)

### Where: Admin Dashboard → User Management → Sessions

**Use Case:** Suspect compromised password, need to force logout everywhere

```
POST /api/login.admin.force-password-change
Authorization: Bearer [Admin Session Token]

Body:
{
  "emp_id": "EMP001",
  "reason": "Suspected account compromise"
}

Result:
- ALL sessions for EMP001 revoked
- Next login: user must change password before entering system
- Audit log: PASSWORD_FORCE_CHANGED
```

**Existing endpoint:** [d:/ERP/TDOne/td-one/remix-app/app/routes/api.login.admin.revoke-sessions.ts](api.login.admin.revoke-sessions.ts)

---

## 4. Audit Logging & Monitoring

### Where: Admin Dashboard → Security → Audit Logs

**Query recent login events:**
```sql
SELECT 
  emp_id,
  event_type,
  severity,
  device_id,
  ip_address,
  is_alert,
  metadata,
  created_at
FROM security_audit_logs
WHERE event_type LIKE 'LOGIN_%'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 100;
```

**Event Types to monitor:**
| Event | Meaning | Action |
|-------|---------|--------|
| `LOGIN_SUCCESS` | User logged in | ✅ Normal |
| `LOGIN_FAILED` | Wrong password | Check rate limit |
| `DEVICE_REGISTERED` | New device registered | ✅ Normal |
| `DEVICE_DEACTIVATED` | Admin removed device | ✅ Normal |
| `SESSION_REVOKED` | Session terminated | Check if admin action or timeout |
| `ACCOUNT_LOCKED` | Too many failed attempts | Send to user: "locked 15 min" |
| `DEVICE_LIMIT_REACHED` | User tried 3rd device | Notify user, escalate if pattern |
| `MOCK_LOCATION_DETECTED` | Fake GPS detected | Alert security team |
| `SALARY_DATA_ACCESSED` | Employee viewed payslip | ✅ Audit trail |
| `SALARY_ACCESS_LOCKED` | Too many salary re-auth failures | Notify support |

**Alerts (is_alert = true):**
- `severity: critical` → Escalate to security team immediately
- `severity: warning` → Log, monitor, notify if pattern emerges

**Example alert query:**
```sql
SELECT 
  emp_id,
  event_type,
  severity,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM security_audit_logs
WHERE is_alert = true
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY emp_id, event_type, severity
ORDER BY severity DESC, count DESC;
```

---

## 5. Salary Access Control

### Where: Payslip View → Requires Re-Authentication

**Employee workflow:**
1. Goes to Salary Slip view
2. System shows: "Verify password to view salary data"
3. Employee enters password
4. System issues 5-minute salary token
5. Employee can view salary data for 5 minutes
6. After 5 minutes, must verify again

**Rate Limit:**
- Max 3 failed attempts per 15 minutes
- After 3 fails → locked out for 15 minutes (separate from login lockout)
- Audit logged: `SALARY_ACCESS_LOCKED`

**Off-hours Alert:**
- If salary accessed between 20:00-07:00 Bangkok time → `is_alert: true`
- Security team can monitor unusual access patterns

**Query suspicious salary access:**
```sql
SELECT 
  emp_id,
  COUNT(*) as access_count,
  COUNT(CASE WHEN access_granted = false THEN 1 END) as failed_attempts,
  MAX(accessed_at) as last_access
FROM salary_access_logs
WHERE accessed_at > NOW() - INTERVAL '7 days'
GROUP BY emp_id
HAVING COUNT(CASE WHEN access_granted = false THEN 1 END) > 5
ORDER BY failed_attempts DESC;
```

---

## 6. Best Practices & Recommendations

### For Device Management
- ✅ Regularly remind employees to deactivate devices they no longer use
- ✅ When employee reports lost/stolen phone, deactivate immediately
- ❌ Don't manually edit device table (use API endpoints)
- ✅ If multiple devices look suspicious, use "deactivate_all" + force password change

### For Onboarding
- ✅ Generate codes only when HR is ready to give them out
- ✅ Use secure channel (not Slack/email without encryption)
- ✅ Codes expire after 72 hours (remind employee today, not next week)
- ❌ Don't reuse codes (each activation is 1-time use)
- ✅ Track adoption: monitor how many employees activated within 24 hours

### For Audit Logs
- ✅ Review logs weekly (anomalies often appear in patterns, not single events)
- ✅ Set up log retention policy: keep 2 years minimum (compliance requirement)
- ✅ Archive old logs monthly for long-term storage
- ❌ Don't modify/delete audit logs (append-only by design)

### Password Change Strategy
- ✅ Force change after 30 days of inactivity (future feature)
- ✅ Notify employee: "Your password is 30 days old, please update"
- ✅ After breach/suspect: immediately revoke all sessions + force change
- ❌ Don't force password change more than once per quarter (user frustration)

---

## Quick Reference: API Endpoints for Admin

| Action | Endpoint | Method | Auth |
|--------|----------|--------|------|
| List devices | `/api/admin/devices?emp_id=X` | GET | Admin |
| Deactivate device | `/api/admin/devices` | POST | Admin |
| Deactivate all | `/api/admin/devices` | POST | Admin |
| Create activation code | `/api/admin/activation-code` | POST | Admin |
| Issue temp PIN | `/api/login.admin.issue-temp-pin` | POST | Admin |
| Revoke sessions | `/api/login.admin.revoke-sessions` | POST | Admin |
| View audit logs | `SELECT * FROM security_audit_logs` | SQL | DBA |

---

## Troubleshooting

### "User locked out of all devices"
**Symptom:** Employee says "every device says deactivated"  
**Diagnosis:** User had `deactivate_all` run on account  
**Resolution:** 
1. Verify audit log shows admin action (not malicious)
2. If intentional (lost all phones): guide employee through activation code flow
3. If error: check if multiple deactivations ran (transaction issue)

### "Device limit check seems stuck"
**Symptom:** Employee can't register 2nd device, but list shows 1 device  
**Diagnosis:** Old device count query cached or soft-delete not handled  
**Resolution:**
```sql
-- Check actual active devices
SELECT * FROM employee_devices 
WHERE employee_id = (SELECT id FROM employees WHERE employee_code = 'EMP001')
  AND is_active = true;

-- If showing 2 but user can't add: check is_active flag
UPDATE employee_devices 
SET is_active = false 
WHERE is_active IS NULL;
```

### "Audit log not recording events"
**Symptom:** No new events in `security_audit_logs` for 1+ hour  
**Diagnosis:** Disk full, DB write error, network issue, or app code not calling writeAuditLog  
**Resolution:**
```bash
# Check DB disk space
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename = 'security_audit_logs'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# If full: archive old logs
INSERT INTO security_audit_logs_archive
SELECT * FROM security_audit_logs WHERE created_at < NOW() - INTERVAL '1 year';

DELETE FROM security_audit_logs WHERE created_at < NOW() - INTERVAL '1 year';
VACUUM ANALYZE security_audit_logs;
```

---

**Last Updated:** 2026-03-19  
**Next Review:** 2026-04-19
