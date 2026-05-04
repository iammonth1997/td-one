import { getEnvValue } from "./env.server";

type LeaveSheetRow = {
  id: string;
  employee_id: string;
  leave_type_code: string;
  start_date: Date | string | number;
  end_date: Date | string | number;
  total_days: number;
  reason: string;
  status: string;
  approved_by?: string | null;
  approved_at?: Date | string | null;
  rejected_reason?: string | null;
  created_at: Date | string;
  employee_name?: string;
  employee_position?: string;
  employee_department?: string;
  employee_site?: string;
  submitted_by_id?: string;
  submitted_by_name?: string;
};

type GoogleSheetsConfig = {
  serviceAccountEmail: string;
  privateKey: string;
  spreadsheetId: string;
  sheetName: string;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function getProcessEnv(key: string) {
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}

function getConfig(context?: unknown): GoogleSheetsConfig {
  const serviceAccountEmail =
    getEnvValue(context, "GOOGLE_SERVICE_ACCOUNT_EMAIL") ?? getProcessEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey =
    getEnvValue(context, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") ?? getProcessEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  const spreadsheetId =
    getEnvValue(context, "GOOGLE_SHEETS_LEAVE_SPREADSHEET_ID") ?? getProcessEnv("GOOGLE_SHEETS_LEAVE_SPREADSHEET_ID");
  const sheetName =
    getEnvValue(context, "GOOGLE_SHEETS_LEAVE_SHEET_NAME") ?? getProcessEnv("GOOGLE_SHEETS_LEAVE_SHEET_NAME") ?? "LeaveRequests";

  if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
    throw new Error("Google Sheets configuration missing");
  }

  return {
    serviceAccountEmail,
    privateKey,
    spreadsheetId,
    sheetName,
  };
}

function normalizePrivateKey(privateKey: string) {
  const unquoted = privateKey.trim().replace(/^["']|["']$/g, "");
  return unquoted.replace(/\\n/g, "\n");
}

function base64UrlEncode(input: string | ArrayBuffer) {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = normalizePrivateKey(pem)
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function importPrivateKey(privateKey: string) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
}

async function createServiceAccountJwt(config: GoogleSheetsConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claim = {
    iss: config.serviceAccountEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const key = await importPrivateKey(config.privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  );

  return `${unsignedJwt}.${base64UrlEncode(signature)}`;
}

async function getAccessToken(config: GoogleSheetsConfig) {
  const assertion = await createServiceAccountJwt(config);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Google token request failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const accessToken = payload.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Google token response missing access_token");
  }

  return accessToken;
}

function formatDateValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  const utcPlus7 = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return utcPlus7.toISOString().replace("T", " ").substring(0, 19);
}

function formatDateOnly(value: Date | string | number | null | undefined): string {
  if (!value) return "";

  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().substring(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().substring(0, 10);
    }
    return trimmed;
  }

  if (value instanceof Date) {
    return value.toISOString().substring(0, 10);
  }

  return String(value);
}

function toSheetRow(leaveData: LeaveSheetRow) {
  return [
    leaveData.id,
    leaveData.employee_id,
    leaveData.leave_type_code,
    formatDateOnly(leaveData.start_date),
    formatDateOnly(leaveData.end_date),
    leaveData.total_days,
    leaveData.reason,
    leaveData.status,
    leaveData.approved_by ?? "",
    formatDateValue(
      leaveData.status === "SUBMITTED"
        ? leaveData.created_at
        : leaveData.approved_at,
    ),
    formatDateValue(leaveData.created_at),
    leaveData.employee_name ?? "",
    leaveData.employee_position ?? "",
    leaveData.employee_department ?? "",
    leaveData.employee_site ?? "",
    leaveData.submitted_by_id ?? "",
    leaveData.submitted_by_name ?? "",
  ];
}

export async function appendLeaveToSheet(
  leaveData: LeaveSheetRow,
  context?: unknown,
): Promise<void> {
  console.log("[SheetsSync] appendLeaveToSheet called for employee:", leaveData.employee_id);
  try {
    const config = getConfig(context);
    const accessToken = await getAccessToken(config);
    const range = `${config.sheetName}!A:Q`;
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}` +
      `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [toSheetRow(leaveData)],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Google Sheets append failed: ${response.status} ${body}`);
    }
  } catch (error) {
    console.error("Google Sheets leave sync failed:", error);
    console.error("[SheetsSync] FULL ERROR:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
  }
}

export async function deleteLeaveFromSheet(
  requestId: string,
  context?: unknown,
): Promise<void> {
  try {
    const config = getConfig(context);
    const accessToken = await getAccessToken(config);
    const getRange = `${config.sheetName}!A:A`;
    const getUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}` +
      `/values/${encodeURIComponent(getRange)}`;

    const getResponse = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!getResponse.ok) {
      const body = await getResponse.text().catch(() => "");
      throw new Error(`Google Sheets delete lookup failed: ${getResponse.status} ${body}`);
    }

    const getData = (await getResponse.json()) as { values?: string[][] };
    const rows = getData.values ?? [];
    const rowIndex = rows.findIndex((row) => row[0] === requestId);
    if (rowIndex === -1) {
      console.log(`[SheetsSync] deleteLeaveFromSheet: ID not found in sheet: ${requestId}`);
      return;
    }

    const sheetRowNumber = rowIndex + 1;
    const updateRange = `${config.sheetName}!H${sheetRowNumber}`;
    const updateUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}` +
      `/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;

    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [["DELETED"]] }),
    });

    if (!updateResponse.ok) {
      const body = await updateResponse.text().catch(() => "");
      throw new Error(`Google Sheets delete update failed: ${updateResponse.status} ${body}`);
    }

    console.log(`[SheetsSync] Marked as DELETED in sheet: ${requestId}`);
    const syncUrl =
      getEnvValue(context, "GOOGLE_APPS_SCRIPT_SYNC_URL") ?? getProcessEnv("GOOGLE_APPS_SCRIPT_SYNC_URL");

    if (syncUrl) {
      fetch(syncUrl).catch((err) =>
        console.error("[SheetsSync] Apps Script trigger failed:", err),
      );
      console.log("[SheetsSync] Apps Script sync triggered");
    }
  } catch (error) {
    console.error("[SheetsSync] deleteLeaveFromSheet failed:", error);
  }
}
