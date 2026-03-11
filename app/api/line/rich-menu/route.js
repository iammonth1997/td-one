import { validateSession } from "@/lib/validateSession";

const ALLOWED_ROLES = new Set([
  "admin",
  "super_admin",
  "hr_payroll",
  "hr-payroll",
  "hr payroll",
  "hrpayroll",
]);

const LINE_API_BASE = "https://api.line.me/v2/bot";

function canManageRichMenu(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ALLOWED_ROLES.has(normalized);
}

function lineHeaders(contentType) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

async function lineFetch(path, options = {}) {
  const res = await fetch(`${LINE_API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body,
    };
  }

  return { ok: true, status: res.status, body };
}

function unauthorizedByApiKey(req) {
  const key = process.env.LINE_ADMIN_API_KEY;
  if (!key) return false;

  const incoming = req.headers.get("x-line-admin-key");
  return incoming !== key;
}

export async function GET(req) {
  if (unauthorizedByApiKey(req)) {
    return Response.json({ error: "FORBIDDEN_API_KEY" }, { status: 403 });
  }

  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!canManageRichMenu(session.role)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const result = await lineFetch("/richmenu/list", {
      method: "GET",
      headers: lineHeaders(),
    });

    if (!result.ok) {
      return Response.json({ error: "LINE_API_ERROR", detail: result.body }, { status: result.status });
    }

    return Response.json({ success: true, data: result.body });
  } catch (error) {
    return Response.json({ error: "RICH_MENU_LIST_FAILED", detail: String(error.message || error) }, { status: 500 });
  }
}

export async function POST(req) {
  if (unauthorizedByApiKey(req)) {
    return Response.json({ error: "FORBIDDEN_API_KEY" }, { status: 403 });
  }

  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!canManageRichMenu(session.role)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const payload = await req.json();
    const action = String(payload.action || "").trim();

    if (action === "create_and_set_default") {
      const richMenu = payload.richMenu;
      const imageBase64 = payload.imageBase64;
      const imageContentType = payload.imageContentType || "image/png";

      if (!richMenu || !imageBase64) {
        return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
      }

      const createRes = await lineFetch("/richmenu", {
        method: "POST",
        headers: lineHeaders("application/json"),
        body: JSON.stringify(richMenu),
      });

      if (!createRes.ok) {
        return Response.json({ error: "LINE_CREATE_RICH_MENU_FAILED", detail: createRes.body }, { status: createRes.status });
      }

      const richMenuId = createRes.body?.richMenuId;
      if (!richMenuId) {
        return Response.json({ error: "LINE_CREATE_RICH_MENU_NO_ID" }, { status: 500 });
      }

      const imageBuffer = Buffer.from(imageBase64, "base64");
      const imageRes = await lineFetch(`/richmenu/${encodeURIComponent(richMenuId)}/content`, {
        method: "POST",
        headers: lineHeaders(imageContentType),
        body: imageBuffer,
      });

      if (!imageRes.ok) {
        return Response.json({ error: "LINE_UPLOAD_RICH_MENU_IMAGE_FAILED", detail: imageRes.body, richMenuId }, { status: imageRes.status });
      }

      const defaultRes = await lineFetch(`/user/all/richmenu/${encodeURIComponent(richMenuId)}`, {
        method: "POST",
        headers: lineHeaders(),
      });

      if (!defaultRes.ok) {
        return Response.json({ error: "LINE_SET_DEFAULT_RICH_MENU_FAILED", detail: defaultRes.body, richMenuId }, { status: defaultRes.status });
      }

      return Response.json({ success: true, richMenuId });
    }

    if (action === "link_user") {
      const userId = String(payload.userId || "").trim();
      const richMenuId = String(payload.richMenuId || "").trim();
      if (!userId || !richMenuId) {
        return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
      }

      const linkRes = await lineFetch(`/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(richMenuId)}`, {
        method: "POST",
        headers: lineHeaders(),
      });

      if (!linkRes.ok) {
        return Response.json({ error: "LINE_LINK_USER_FAILED", detail: linkRes.body }, { status: linkRes.status });
      }

      return Response.json({ success: true, userId, richMenuId });
    }

    if (action === "unlink_user") {
      const userId = String(payload.userId || "").trim();
      if (!userId) {
        return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
      }

      const unlinkRes = await lineFetch(`/user/${encodeURIComponent(userId)}/richmenu`, {
        method: "DELETE",
        headers: lineHeaders(),
      });

      if (!unlinkRes.ok) {
        return Response.json({ error: "LINE_UNLINK_USER_FAILED", detail: unlinkRes.body }, { status: unlinkRes.status });
      }

      return Response.json({ success: true, userId });
    }

    if (action === "delete") {
      const richMenuId = String(payload.richMenuId || "").trim();
      if (!richMenuId) {
        return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
      }

      const deleteRes = await lineFetch(`/richmenu/${encodeURIComponent(richMenuId)}`, {
        method: "DELETE",
        headers: lineHeaders(),
      });

      if (!deleteRes.ok) {
        return Response.json({ error: "LINE_DELETE_RICH_MENU_FAILED", detail: deleteRes.body }, { status: deleteRes.status });
      }

      return Response.json({ success: true, richMenuId });
    }

    return Response.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: "RICH_MENU_REQUEST_FAILED", detail: String(error.message || error) }, { status: 500 });
  }
}
