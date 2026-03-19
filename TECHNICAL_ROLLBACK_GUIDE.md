# Technical Rollback & Data Recovery Guide

**Version:** 1.0  
**Date:** 2026-03-19  
**Audience:** Database Administrators, DevOps Engineers  

---

## Pre-Deployment Backup Strategy

### Backup Schedule
```bash
# Before deployment (automated)
03:00 UTC: Daily full backup
04:00 UTC: Upload to cold storage (AWS S3)
Retention: Latest 7 full + monthly backups for 2 years

Command:
pg_dump -h $DB_HOST -U $DB_USER \
  --format=custom \
  --verbose \
  --file=postgres_backup_$(date +%Y%m%d_%H%M%S).dump \
  $DB_NAME
```

### Backup Verification
```bash
# Verify backup is restorable
pg_restore --list postgres_backup_20260319_030000.dump | head -20

# Test restore to scratch database
createdb test_restore
pg_restore --verbose \
  --exit-on-error \
  --dbname=test_restore \
  postgres_backup_20260319_030000.dump
  
# Verify schema
psql -d test_restore -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
# Expected: >50 tables (should include new tables from migration 017)

dropdb test_restore
```

---

## Migration Execution & Verification

### Pre-Migration Checks

```sql
-- 1. Verify backup exists & is recent
SELECT size, modification_time 
FROM pg_stat_file('/backups/postgres_backup_latest.dump');

-- 2. Check current schema version
SELECT version FROM schema_versions ORDER BY applied_at DESC LIMIT 5;

-- 3. Count users before migration
SELECT COUNT(*) as total_users FROM login_users WHERE is_registered = true;
SELECT COUNT(*) as with_pin FROM login_users WHERE pin_hash IS NOT NULL;

-- 4. Verify no locks
SELECT 
  pid, 
  usename, 
  application_name, 
  state 
FROM pg_stat_activity 
WHERE state = 'active' AND query NOT LIKE '%pg_stat%';
-- Expected: only your connection or minimal activity
```

### Migration Execution

```bash
#!/bin/bash
set -e

DB_HOST="prod-db.example.com"
DB_USER="postgres"
DB_NAME="erp_production"
LOG_FILE="migration_$(date +%Y%m%d_%H%M%S).log"

echo "=== Starting Migration 017 & 018 ===" | tee -a $LOG_FILE
date | tee -a $LOG_FILE

# Run migration 017 (schema)
echo "Applying migration 017..." | tee -a $LOG_FILE
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -f migrations/017_security_architecture_upgrade.sql \
  >> $LOG_FILE 2>&1 || {
    echo "ERROR: Migration 017 failed" | tee -a $LOG_FILE
    exit 1
  }

# Run migration 018 (data)
echo "Applying migration 018..." | tee -a $LOG_FILE
psql -h $DB_HOST -U $DB_USER -d $DB_NAME \
  -f migrations/018_migrate_pin_to_password_system.sql \
  >> $LOG_FILE 2>&1 || {
    echo "ERROR: Migration 018 failed" | tee -a $LOG_FILE
    exit 1
  }

echo "=== Migrations Complete ===" | tee -a $LOG_FILE
date | tee -a $LOG_FILE
```

### Post-Migration Verification

```sql
-- Check migration status
SELECT version, applied_at FROM schema_versions 
WHERE version IN ('017', '018') 
ORDER BY version DESC;

-- Verify new tables exist & have data
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'employee_devices',
    'security_audit_logs',
    'salary_access_logs',
    'employee_activations',
    'salary_sessions'
  );

-- Verify employee_devices populated with legacy data
SELECT 
  COUNT(*) as total_legacy_devices,
  COUNT(DISTINCT employee_id) as employees_with_legacy_device
FROM employee_devices 
WHERE device_id LIKE 'legacy-%';

-- Verify password migration flags set
SELECT 
  COUNT(*) as marked_for_password_change,
  COUNT(*) as total_registered
FROM login_users 
WHERE must_change_password = true 
  AND is_registered = true;

-- Verify audit log migration marker
SELECT * FROM security_audit_logs 
WHERE event_type = 'SYSTEM_MIGRATION_PIN_TO_PASSWORD_START' 
ORDER BY created_at DESC 
LIMIT 1;

-- Check for any constraint violations (should be empty)
SELECT 
  table_name,
  constraint_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND constraint_type = 'CHECK'
  AND table_name IN (
    'employee_devices',
    'security_audit_logs',
    'salary_sessions'
  );
```

---

## Rollback Procedures

### Scenario 1: Code-Only Rollback (No data changes needed)

**Use if:** New code has critical bug but database is OK

```bash
# 1. Revert worker code
git checkout main  # or previous stable tag
npm run build
wrangler deploy

# 2. Verify old endpoints still work
curl https://tdone-erp.com/api/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"emp_id":"TEST001","pin":"123456"}'

# 3. Monitor logs for errors
wrangler tail --format pretty
```

**Data integrity:** ✅ Preserved (no schema changes)  
**Session status:** ⚠️ Affected (new sessions in DB but old code may not understand new fields)  
**Recovery time:** 5 minutes  
**Risk:** Low

---

### Scenario 2: Full Database Rollback (If migrations caused issues)

**Use if:** Migration errors, data corruption, or constraint violations

```bash
# 1. Note current time (for transaction rollback if available)
NOW=$(date +%s)

# 2. Stop all application traffic
# (coordinate with ops team - tell users "brief maintenance")

# 3. Get the last clean backup BEFORE migration 017
# Assuming backup naming: postgres_backup_YYYYMMDD_HHMMSS.dump
BACKUP_FILE="postgres_backup_20260319_020000.dump"  # pre-migration backup

# 4. Terminate existing connections
psql -h $DB_HOST -U $DB_USER -d postgres -c \
  "SELECT pg_terminate_backend(pg_stat_activity.pid) 
   FROM pg_stat_activity 
   WHERE pg_stat_activity.datname = 'erp_production' 
     AND pid <> pg_backend_pid();"

# 5. Drop corrupted database
dropdb -h $DB_HOST -U $DB_USER erp_production

# 6. Restore from backup
createdb -h $DB_HOST -U $DB_USER erp_production
pg_restore -h $DB_HOST -U $DB_USER \
  --exit-on-error \
  --verbose \
  --dbname=erp_production \
  $BACKUP_FILE

# 7. Verify restored database
psql -h $DB_HOST -U $DB_USER -d erp_production -c \
  "SELECT COUNT(*) FROM login_users; SELECT COUNT(*) FROM sessions;"

# 8. Revert to pre-migration code
git checkout main
npm run build
wrangler deploy

# 9. Reopen system to users
# Send notification: "System restored, back online"

# 10. Begin investigation
# - Check what went wrong in migration logs
# - Review error messages in postgres logs
# - Plan corrective actions
```

**Data integrity:** ✅ All pre-migration data restored (post-migration changes lost)  
**Session status:** ⚠️ Sessions created after rollback time are gone  
**Recovery time:** 15-30 minutes  
**Risk:** Medium (data loss between backup and rollback)  
**Data loss:** Up to 1 day of transaction history (if using daily backups)

---

### Scenario 3: Partial Rollback (Schema stays, code reverts)

**Use if:** New schema is good but code has CRITICAL bug

```sql
-- 1. Keep migration 017 & 018 (schema changes were valid)
-- 2. Don't revert must_change_password flag yet

-- 3. Revert code to previous version
git checkout main
npm run build
wrangler deploy

-- 4. Run patch code ASAP to fix bug properly
-- Don't re-migrate, just code fix

-- 5. Monitor: sessions created with new schema 
--    but old code accessing it (may have type errors)

-- 6. If type errors: fall back to Scenario 2 (full rollback)
```

**Data integrity:** ✅ Schema preserved (migrations completed successfully)  
**Session status:** ⚠️ Inconsistent (old code + new schema)  
**Recovery time:** 5 minutes to revert + longer recovery time  
**Risk:** High (mismatched code/schema may cause data corruption)  
**Recommendation:** Prefer Scenario 1 or 2 over this

---

### Scenario 4: Targeted Table Rollback (If only one feature broken)

**Use if:** e.g., only `security_audit_logs` table has issues

```sql
-- 1. Identify problematic table
-- 2. Rename it (backup)
ALTER TABLE security_audit_logs 
RENAME TO security_audit_logs_broken;

-- 3. Recreate clean table from migration DDL
CREATE TABLE security_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  emp_id VARCHAR(20),
  device_id VARCHAR(100),
  ip_address VARCHAR(45),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  metadata JSONB,
  is_alert BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_emp_id ON security_audit_logs(emp_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON security_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_alert ON security_audit_logs(is_alert) WHERE is_alert = true;

-- 5. If you want to save good logs from broken table:
INSERT INTO security_audit_logs 
SELECT * FROM security_audit_logs_broken 
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND metadata IS NOT NULL;  -- cherry-pick valid records

-- 6. Test before dropping backup
SELECT COUNT(*) FROM security_audit_logs;

-- 7. If good: drop broken table
DROP TABLE security_audit_logs_broken;
```

**Data integrity:** ⚠️ May lose recent audit entries  
**Recovery time:** 5-10 minutes  
**Risk:** Low-Medium (other tables unaffected)  
**Best for:** Non-critical audit issues

---

## Point-in-Time Recovery (PITR)

If PostgreSQL is running with WAL archiving & PITR enabled:

```bash
# 1. Check available backups & WAL files
ls -lh /var/lib/postgresql/wal_archive/*.wal.gz

# 2. Restore to specific time
# (coordinate with DBA)
pg_ctl stop
psql -U postgres -d postgres << 'EOF'
  SELECT pg_stop_backup();
EOF

# 3. Edit recovery config
# (in PostgreSQL 14+: recovery.conf or command-line)
recovery_target_timeline = 'latest'
recovery_target_time = '2026-03-19 10:30:00'
recovery_target_inclusive = true

# 4. Start recovery
pg_ctl start -l recovery.log

# 5. Monitor logs
tail -f recovery.log

# 6. When recovery complete, test & resume operations
```

---

## Monitoring During Rollback

```sql
-- Monitor active connections
SELECT 
  usename,
  application_name,
  state,
  query,
  query_start
FROM pg_stat_activity
WHERE datname = 'erp_production'
  AND usename != 'postgres'
ORDER BY query_start DESC;

-- Monitor index rebuild progress
SELECT 
  relname,
  pg_size_pretty(pg_relation_size(oid)) as size
FROM pg_class
WHERE relname LIKE 'idx_%'
ORDER BY pg_relation_size(oid) DESC;

-- Monitor replication lag (if using replicas)
SELECT 
  application_name,
  client_addr,
  state,
  write_lag,
  flush_lag,
  replay_lag
FROM pg_stat_replication;

-- Monitor table bloat after full restore
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
```

---

## Post-Rollback Process

### 1. Investigation (2-4 hours)
- [ ] Identify root cause of failure
- [ ] Collect logs: `wrangler tail`, PostgreSQL error logs, application logs
- [ ] Review migration script for errors
- [ ] Check for environmental issues (disk space, memory, network)

### 2. Remediation (8-24 hours)
- [ ] Fix bug in code or migration script
- [ ] Test in staging environment (full E2E test)
- [ ] Prepare new deployment plan
- [ ] Get peer review of fixes

### 3. Re-deployment (next business day)
- [ ] Schedule maintenance window
- [ ] Run migrations again with monitoring
- [ ] Smoke test all features
- [ ] Gradual rollout (if feature-flagged)

### 4. Post-Mortem (within 48 hours)
- [ ] Document: What failed? Why? How to prevent?
- [ ] Share findings with team
- [ ] Update runbooks & automation
- [ ] Plan preventive measures

---

## Automated Monitoring for Issues

### Long-running Queries
```sql
-- Detect queries taking > 5 minutes
SELECT 
  pid,
  usename,
  query,
  query_start,
  AGE(now(), query_start) as duration
FROM pg_stat_activity
WHERE state = 'active'
  AND query NOT LIKE '%pg_stat%'
  AND AGE(now(), query_start) > INTERVAL '5 minutes'
ORDER BY duration DESC;

-- AUTO-ALERT if > 1 found
```

### Constraint Violations
```sql
-- Check for rows violating constraints
SELECT * FROM login_users
WHERE pin_hash IS NULL
  AND is_registered = true;  -- should be empty

SELECT * FROM employee_devices
WHERE employee_id IS NULL;   -- should be empty

SELECT * FROM sessions
WHERE emp_id IS NULL;        -- should be empty
```

### Replica Lag
```sql
-- Alert if replication lag > 1 second
SELECT MAX(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) / 1024 / 1024 as lag_mb
FROM pg_stat_replication;
-- Should be < 0.1 MB usually
```

---

## Checklist: Successful Rollback

✅ **After rollback, verify:**
- [ ] Database online & accepting connections
- [ ] All tables present with correct schemas (if full restore)
- [ ] Application code version matches database (schema compatibility)
- [ ] Sample login flow works end-to-end
- [ ] No 5xx errors in worker logs
- [ ] Audit logs accessible (for post-incident investigation)
- [ ] Replicas re-synced & in-sync
- [ ] Backups completed (new backup post-rollback)
- [ ] Team notified of status & timeline

---

## Escalation Contacts

| Role | Contact | Phone | Email |
|------|---------|-------|-------|
| On-Call DBA | [Name] | [+66-XXX] | [email] |
| Database Lead | [Name] | [+66-XXX] | [email] |
| Dev Lead | [Name] | [+66-XXX] | [email] |
| Ops Manager | [Name] | [+66-XXX] | [email] |

---

**Document Owner:** Database Team  
**Last Updated:** 2026-03-19  
**Next Review:** 2026-04-19
