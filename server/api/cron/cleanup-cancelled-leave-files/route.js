import prisma from "@/lib/prisma";
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

  const now = new Date();

  let rows;
  try {
    rows = await prisma.leaveRequest.findMany({
      where: {
        status: "cancelled",
        attachment_active: false,
        attachment_deleted_at: null,
        attachment_url: { not: null },
        attachment_delete_after: { lte: now },
      },
      select: {
        id: true,
        employee_id: true,
        status: true,
        attachment_url: true,
        attachment_public_id: true,
        attachment_resource_type: true,
      },
      take: 500,
    });
  } catch (queryErr) {
    const message = String(queryErr.message || "");
    if (message.includes("does not exist")) {
      return Response.json({
        success: true,
        skipped: true,
        reason: "SCHEMA_NOT_READY",
        detail: message,
        scanned: 0,
        deleted: 0,
        failed: 0,
        failures: [],
      });
    }
    return Response.json({ error: "CLEANUP_QUERY_FAILED", detail: queryErr.message }, { status: 500 });
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

      const deletedAt = new Date();

      await prisma.leaveRequest.update({
        where: { id: row.id },
        data: {
          attachment_url: null,
          attachment_public_id: null,
          attachment_resource_type: null,
          attachment_deleted_at: deletedAt,
        },
      });

      await prisma.leaveRequestFileDeletionAudit.upsert({
        where: { request_id: row.id },
        create: {
          request_id: row.id,
          employee_id: row.employee_id,
          leave_type_code: "unknown",
          status: row.status,
          cloudinary_public_id: publicId,
          deleted_at: deletedAt,
        },
        update: {
          cloudinary_public_id: publicId,
          deleted_at: deletedAt,
        },
      });

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
