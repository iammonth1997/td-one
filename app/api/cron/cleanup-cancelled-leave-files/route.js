import { supabaseServer } from "@/lib/supabaseServer";
import { deleteCloudinaryAssetByPublicId, extractCloudinaryPublicId } from "@/lib/cloudinaryServerUtils";

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const direct = req.headers.get("x-cron-secret") || "";
  return bearer === expected || direct === expected;
}

export async function GET(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const { data: rows, error: queryError } = await supabaseServer
    .from("leave_requests")
    .select("id, employee_id, leave_type_code, status, attachment_url, attachment_public_id, attachment_resource_type")
    .eq("status", "cancelled")
    .eq("attachment_active", false)
    .is("attachment_deleted_at", null)
    .not("attachment_url", "is", null)
    .lte("attachment_delete_after", nowIso)
    .limit(500);

  if (queryError) {
    return Response.json({ error: "CLEANUP_QUERY_FAILED", detail: queryError.message }, { status: 500 });
  }

  const summary = {
    scanned: rows?.length || 0,
    deleted: 0,
    failed: 0,
    failures: [],
  };

  for (const row of rows || []) {
    try {
      const publicId = row.attachment_public_id || extractCloudinaryPublicId(row.attachment_url);
      if (!publicId) {
        throw new Error("MISSING_PUBLIC_ID");
      }

      await deleteCloudinaryAssetByPublicId(publicId, row.attachment_resource_type || null);

      const deletedAt = new Date().toISOString();
      const { error: updateError } = await supabaseServer
        .from("leave_requests")
        .update({
          attachment_url: null,
          attachment_public_id: null,
          attachment_resource_type: null,
          attachment_deleted_at: deletedAt,
          updated_at: deletedAt,
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`UPDATE_FAILED:${updateError.message}`);
      }

      const { error: auditError } = await supabaseServer
        .from("leave_request_file_deletion_audit")
        .upsert({
          request_id: row.id,
          employee_id: row.employee_id,
          leave_type_code: row.leave_type_code,
          status: row.status,
          cloudinary_public_id: publicId,
          deleted_at: deletedAt,
        }, { onConflict: "request_id" });

      if (auditError) {
        throw new Error(`AUDIT_INSERT_FAILED:${auditError.message}`);
      }

      summary.deleted += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        request_id: row.id,
        error: String(error.message || error),
      });
    }
  }

  return Response.json({ success: true, ...summary });
}
