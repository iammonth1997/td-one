/**
 * POST /api/security/alerts/process
 *
 * Runs the security alert checking system.
 * Requires:
 * - CRON_SECRET env var (for scheduled runs)
 * - Or admin session (for manual trigger)
 *
 * Returns: { processed: number, alerts_sent: number }
 */

import { supabaseServer } from "@/lib/supabaseServer";
import { validateSession } from "@/lib/validateSession";
import { processSecurityAlerts, checkAlertConfig } from "@/lib/alert.server";

// Simple cron secret validation
function validateCronSecret(req: Request): boolean {
  const cronSecret = req.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;

  if (!envSecret) {
    console.warn("[alerts/process] CRON_SECRET not configured");
    return false;
  }

  return cronSecret === envSecret;
}

export async function POST(req: Request) {
  // Check if this is a cron job or authenticated admin request
  const isCronRequest = validateCronSecret(req);

  if (!isCronRequest) {
    // Fall back to session auth - admin only
    const { session, error: authError, status: authStatus } = await validateSession(req);
    if (authError) {
      return Response.json({ error: authError }, { status: authStatus });
    }

    // Check if user is admin by checking rbac
    const { data: adminUser } = await supabaseServer
      .from("login_users")
      .select("admin")
      .eq("emp_id", session.emp_id)
      .maybeSingle();

    if (!adminUser?.admin) {
      return Response.json(
        { error: "FORBIDDEN", message: "Admin access required" },
        { status: 403 }
      );
    }
  }

  // Check configuration
  const config = checkAlertConfig();
  if (!config.slackConfigured && !config.emailConfigured) {
    return Response.json(
      {
        error: "ALERTS_NOT_CONFIGURED",
        message: config.message,
      },
      { status: 503 }
    );
  }

  try {
    const result = await processSecurityAlerts(supabaseServer, {
      slackEnabled: config.slackConfigured,
      emailEnabled: config.emailConfigured,
    });

    return Response.json({
      success: true,
      message: `Processed ${result.processed} alert events, sent ${result.alerts_sent} notifications`,
      ...result,
      config: config.message,
    });
  } catch (error) {
    console.error("[alerts/process] Error:", error);
    return Response.json(
      {
        error: "ALERT_PROCESSING_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/security/alerts/status
 *
 * Check alert system status and configuration.
 * Admin only.
 */
export async function GET(req: Request) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  // Check if user is admin
  const { data: adminUser } = await supabaseServer
    .from("login_users")
    .select("admin")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  if (!adminUser?.admin) {
    return Response.json(
      { error: "FORBIDDEN", message: "Admin access required" },
      { status: 403 }
    );
  }

  const config = checkAlertConfig();

  // Get recent alerts sent count
  const { data: recentAlerts, error: countError } = await supabaseServer
    .from("security_alerts_sent")
    .select("id", { count: "exact" })
    .gt("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const alertsLast24h = !countError ? (recentAlerts?.length ?? 0) : -1;

  return Response.json({
    system_status: "operational",
    configurations: {
      slack_webhook: config.slackConfigured,
      email_smtp: config.emailConfigured,
      cron_secret: !!process.env.CRON_SECRET,
    },
    alerts_sent_24h: alertsLast24h,
    message: config.message,
    endpoints: {
      manual_trigger: "POST /api/security/alerts/process",
      cron_trigger: "POST /api/security/alerts/process (with x-cron-secret header)",
      examples: {
        slack_webhook: "SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...",
        cron_trigger: "curl -X POST https://yourdomain.com/api/security/alerts/process -H 'x-cron-secret: your-secret'",
      },
    },
  });
}
