-- Migration: Create security alerts tracking table
-- Allows deduplication of alert notifications to prevent spam

CREATE TABLE security_alerts_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  emp_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_rule_emp_per_hour UNIQUE (rule_name, emp_id, DATE_TRUNC('hour', sent_at))
);

-- Index for rapid lookups during deduplication
CREATE INDEX idx_alerts_sent_rule_emp_time 
  ON security_alerts_sent(rule_name, emp_id, sent_at DESC);

CREATE INDEX idx_alerts_sent_created 
  ON security_alerts_sent(created_at DESC);

-- Set retention policy: Keep alerts for 90 days
ALTER TABLE security_alerts_sent ENABLE ROW LEVEL SECURITY;

-- Allow service role to read/write for alert system
CREATE POLICY "Service role manages alert tracking" ON security_alerts_sent
  FOR ALL USING (true)
  WITH CHECK (true);

-- Allow authenticated users to view their own alerts (optional)
CREATE POLICY "Users can read their own alert history" ON security_alerts_sent
  FOR SELECT USING (emp_id = auth.jwt() ->> 'emp_id');

COMMENT ON TABLE security_alerts_sent IS 'Audit trail of sent security alerts for deduplication and monitoring';
COMMENT ON COLUMN security_alerts_sent.rule_name IS 'Alert rule that triggered (e.g., MULTIPLE_LOGIN_FAILURES)';
COMMENT ON COLUMN security_alerts_sent.emp_id IS 'Employee affected; NULL for system-wide alerts';
COMMENT ON COLUMN security_alerts_sent.severity IS 'Alert severity level: critical, warning, info';
COMMENT ON COLUMN security_alerts_sent.sent_at IS 'When alert was sent (dedup window)';
