# Security Architecture Upgrade — Deployment Checklist

**Version:** 1.0  
**Date:** 2026-03-19  
**Scope:** Device Trust + NIST Password + Audit Logging + Salary Re-auth + Onboarding  

---

## Pre-Deployment (24 hours before)

### Code Review & Testing
- [ ] All TypeScript files compile without errors → `npm run typecheck`
- [ ] New services tested locally:
  - [ ] Device registration flow (max 2 devices)
  - [ ] Password policy validation (min 12 chars, no weak patterns)
  - [ ] Admin remote wipe endpoint
  - [ ] Salary re-auth 5-min token
  - [ ] Activation code generation & validation
- [ ] Database migrations reviewed by 2+ team members
- [ ] Audit log entries verified in local DB
- [ ] Rollback procedures tested in staging

### Staging Environment Verification
- [ ] Run migration 017 & 018 against staging DB
- [ ] Verify new tables created: `employee_devices`, `security_audit_logs`, `salary_access_logs`, `employee_activations`, `salary_sessions`
- [ ] Check constraints on `employee_devices` (max 2 per employee)
- [ ] Verify old login flow still works (backward compatibility test)
- [ ] Test new login with device_id parameter
- [ ] Test password policy on set-pin & change-pin endpoints

### Documentation
- [ ] Admin guide distributed to IT/HR
- [ ] User communication drafted (if required)
- [ ] Rollback procedure documented & tested
- [ ] Support team trained on new features & expected behavior

---

## Deployment Steps (Production)

### Phase 1: Database & Schema (Downtime: ~2-5 minutes)
**Estimated duration:** 5 minutes  
**Downtime:** YES (advisory: schedule off-peak)

```bash
# 1. Backup production database
pg_dump -h $DB_HOST -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Run migration 017 (schema changes)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/017_security_architecture_upgrade.sql

# 3. Run migration 018 (data migration: mark users to change password)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/018_migrate_pin_to_password_system.sql

# 4. Verify migrations
SELECT version FROM schema_versions WHERE version IN ('017', '018');

# 5. Count affected users
SELECT COUNT(*) FROM login_users WHERE must_change_password = TRUE;
```

- [ ] Backup completed successfully
- [ ] Migration 017 applied without errors
- [ ] Migration 018 applied without errors
- [ ] Verify new tables exist:
  - [ ] `employee_devices`
  - [ ] `security_audit_logs`
  - [ ] `salary_access_logs`
  - [ ] `employee_activations`
  - [ ] `salary_sessions`

### Phase 2: Backend Code Deployment
**Estimated duration:** 10 minutes  
**Downtime:** NO (rolling deploy or blue-green)

```bash
# 1. Deploy new remix-app code
git checkout security-arch-upgrade
npm run build
wrangler deploy

# 2. Verify deployment
curl https://tdone-erp.com/api/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"emp_id":"EMP001","password":"testpass"}' 
# Should return 400 (INVALID_INPUT) or proper error, not 500
```

**New endpoints live:**
- `POST /api/login` — now accepts `device_id`, `device_name`, `platform`
- `POST /api/admin/devices` — device management
- `POST /api/admin/activation-code` — HR onboarding
- `POST /api/login/activate` — employee onboarding
- `POST /api/salary/verify` — salary token endpoint
- All previous endpoints remain backward-compatible

- [ ] Build successful
- [ ] Deployment successful
- [ ] No 5xx errors in logs (check Cloudflare Worker errors)
- [ ] Login endpoint responds correctly

### Phase 3: Smoke Test
**Estimated duration:** 10 minutes

Test in production against staging employees (who already have accounts):

```bash
# Test 1: Old PIN still works (backward compat)
curl https://tdone-erp.com/api/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"emp_id":"TEST001","pin":"123456"}' 
# Expected: 401 INVALID_CREDENTIALS or specific error (user should not be able to login yet)

# Test 2: New device parameter accepted
curl https://tdone-erp.com/api/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"emp_id":"TEST001","password":"TestPass@2026123","device_id":"UUID-test-001","device_name":"TestDevice"}' 
# Expected: 401 (INVALID_CREDENTIALS) or successful login if password is correct

# Test 3: Device limit enforcement
# (Try registering 3rd device, should fail)

# Test 4: Admin device list endpoint
curl https://tdone-erp.com/api/admin/devices?emp_id=TEST001 \
  -H "Authorization: Bearer $ADMIN_SESSION_TOKEN"
# Expected: 200 with device list or 401 (need valid admin session)

# Test 5: Audit log is writing
SELECT COUNT(*) FROM security_audit_logs WHERE created_at > NOW() - INTERVAL '5 minutes';
# Expected: > 0

# Test 6: Salary verify endpoint exists
curl https://tdone-erp.com/api/salary/verify -X POST \
  -H "Content-Type: application/json" \
  -d '{"password":"wrongpass"}' \
  -H "Authorization: Bearer $SESSION_TOKEN"
# Expected: 401 INVALID_CREDENTIALS (password wrong)
```

- [ ] Old PIN-based login still backward-compatible
- [ ] New device parameter accepted
- [ ] Device limit enforced
- [ ] Admin endpoints responsive
- [ ] Audit logs recording events
- [ ] Salary endpoints accessible

---

## Post-Deployment (First 24-48 hours)

### Monitoring & Metrics
- [ ] Monitor error logs for new patterns (search for: `DEVICE_LIMIT_REACHED`, `PASSWORD_TOO_SHORT`, `INVALID_PASSWORD_FORMAT`)
- [ ] Check user login success rate:
  - Baseline: >95% (allow initial spike from "must change password" flow)
  - Target: >98% by end of day 1
- [ ] Verify audit log is capturing events (~10-50 new events per minute in production)
- [ ] Check database query performance on new indexes (`idx_audit_logs_created_at`, `idx_audit_logs_event_type`)

### User Communication
- [ ] If public rollout:
  - [ ] Notify users that password change is required on next login
  - [ ] Provide support contact for issues
  - [ ] Expect 10-20% login failures initially (need to set new password)
  - [ ] Support channel ready to handle escalations

### Feature Activation (Gradual Rollout)
- [ ] **Day 1:** Password change optional (system accepts old PIN or new password)
- [ ] **Day 3:** Enforce new password for new logins (must_change_password = true shows prompt)
- [ ] **Day 7:** Admin can start revoking devices & old sessions
- [ ] **Day 14:** Salary re-auth enforcement (require salary token to view payslips)

### Key Metrics to Watch
```sql
-- Login attempts by type
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  event_type,
  COUNT(*) as count
FROM security_audit_logs
WHERE event_type LIKE 'LOGIN_%'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), event_type
ORDER BY hour DESC, count DESC;

-- Alert threshold: > 10 consecutive LOGIN_FAILED same emp_id = escalate
SELECT 
  emp_id,
  COUNT(*) as failures
FROM security_audit_logs
WHERE event_type = 'LOGIN_FAILED'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY emp_id
HAVING COUNT(*) > 10;

-- Device registration summary
SELECT 
  COUNT(DISTINCT employee_id) as users_with_devices,
  COUNT(*) as total_devices,
  AVG(CASE WHEN is_active THEN 1 ELSE 0 END) as active_rate
FROM employee_devices;

-- Audit log ingestion rate
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as events
FROM security_audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', created_at)
ORDER BY minute DESC;
```

---

## Rollback Procedure (If Critical Issue Found)

### Immediate Rollback (< 30 minutes decision window)

**Option 1: Code Rollback (Fastest)**
```bash
# Revert to previous worker version
git checkout main
npm run build
wrangler deploy

# Users can still login with old PIN
# New features unavailable but old login should work
# Time: ~5 minutes
```

**Option 2: Database + Code Rollback (If data corruption)**
```bash
# 1. Stop all write operations (coordinate with ops)
# 2. Restore from backup taken before migration
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME backup_$(date +%Y%m%d).sql
# 3. Redeploy previous worker code
git checkout main
npm run build
wrangler deploy
# Time: ~15-30 minutes
```

### Partial Rollback (Feature-level disabling)

If only one feature is broken:

```sql
-- Disable device limit check (allow unlimited devices temporarily)
-- Comment out device limit logic in api.login.ts
-- Redeploy

-- Disable salary token enforcement
-- Keep salary verify endpoint but don't require token on payslip view
-- Redeploy

-- Mark audit logs as "non-critical" (accept writes but don't fail request if log write fails)
-- Already implemented (void writeAuditLog)
```

### Decision Criteria for Rollback
- **Rollback immediately if:**
  - Login success rate drops below 50% (system broken)
  - Database corruption detected (null constraints violated)
  - Security incident found (data leaked)
  - Cryptographic key issue (password hashing broken)

- **Monitor first, decide at 2-4 hours if:**
  - Unexpected error patterns but < 2% affected
  - Performance degradation (query timeouts)
  - Audit log ingestion lag

- **No rollback needed if:**
  - Isolated bugs affecting < 0.1% of logins
  - Feature can be hot-patched (e.g., message text)
  - Performance acceptable after optimization

---

## Success Criteria

✅ **Deployment is successful if, at 48 hours:**
- Login success rate > 95%
- No data corruption / constraint violations
- Audit logs capturing > 1000 events/day
- Zero security incidents
- All new endpoints responding (200-400s, no 500s)
- No rollback triggered

✅ **Full rollout ready if, at 1 week:**
- All users tested password change flow
- HR created 50+ activation codes (testing onboarding)
- 2+ tested admin device wipe
- Device limit enforcement working (users hit limit & see error)
- Salary re-auth token validation working
- Zero security escalations

---

## Post-Rollout Optimization (Week 2+)

- [ ] Collect metrics on user feedback
- [ ] Optimize slow queries on `security_audit_logs` if needed (add partition by month)
- [ ] Review audit log alert triggers (adjust thresholds)
- [ ] Document learned lessons
- [ ] Plan Argon2id migration if/when runtime supports it

---

## Support & Escalation

**If users report issues:**

| Issue | Cause | Resolution |
|-------|-------|-----------|
| "Password must be 12+ chars" error | User entering old 6-digit PIN | Direct to password change flow |
| "Device limit reached" | User has 2 devices already | Admin needs to deactivate one device |
| "Activation code invalid" | Old/used/expired code | HR re-generates new code |
| "Salary token expired" | Token older than 5 min | User clicks "verify again" |
| Login loops | Session revoke not applied | Check audit logs, manually revoke session |

---

**Document Owner:** Engineering  
**Next Review:** 2026-03-26  
**Emergency Contact:** [ops-team-contact]
