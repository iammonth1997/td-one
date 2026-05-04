import type { FormEvent } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin.devices";
import AdminShell from "~/components/admin-shell";
import { formatBangkokDateTime } from "~/lib/date-time";
import { requireAdminSession } from "~/lib/require-admin-session.server";

type DeviceRow = {
  id: string;
  device_id?: string | null;
  device_name?: string | null;
  platform?: string | null;
  is_active?: boolean;
  last_active_at?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const query = new URL(request.url).searchParams;
  const targetEmpId = query.get("emp_id") || session.emp_id;

  const url = new URL(request.url);
  url.pathname = "/api/admin/devices";
  url.search = `?emp_id=${encodeURIComponent(targetEmpId)}`;

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const devices = Array.isArray(data.devices) ? (data.devices as DeviceRow[]) : [];

  return { session, targetEmpId, devices };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const actionType = String(formData.get("action") || "").trim();
  const empId = String(formData.get("emp_id") || "").trim().toUpperCase();
  const deviceId = String(formData.get("device_id") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!empId || !actionType) {
    return { ok: false, message: "Missing required action payload." };
  }

  if (actionType === "deactivate" && !deviceId) {
    return { ok: false, message: "Device ID is required for deactivation." };
  }

  if ((actionType === "deactivate" || actionType === "deactivate_all") && !reason) {
    return { ok: false, message: "Reason is required." };
  }

  const url = new URL(request.url);
  url.pathname = "/api/admin/devices";
  url.search = "";

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      action: actionType,
      emp_id: empId,
      device_id: deviceId || undefined,
      reason,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    return {
      ok: false,
      message: String(payload.error ?? payload.message ?? "Action failed."),
    };
  }

  return {
    ok: true,
    message: actionType === "deactivate_all" ? "All devices deactivated." : "Device deactivated.",
  };
}

export default function AdminDevicesPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  function confirmBulkDeactivate(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm("Deactivate all devices for this employee?");
    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <AdminShell title="Devices" session={loaderData.session}>
      {actionData?.message && (
        <section
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            actionData.ok
              ? "border-[#cfe8d8] bg-[#f2fbf5] text-[#245b39]"
              : "border-[#f3c9c9] bg-[#fff5f5] text-[#8f2c2c]"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{actionData.message}</span>
            <Form method="get">
              <input type="hidden" name="emp_id" value={loaderData.targetEmpId} />
              <button className="rounded-md border border-current px-2 py-1 text-xs font-semibold">Refresh List</button>
            </Form>
          </div>
        </section>
      )}

      <section className="mb-4 rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
        <form className="flex items-end gap-2" method="get">
          <div>
            <label className="block text-xs font-semibold text-[#7c8ba1]">EMP ID</label>
            <input
              name="emp_id"
              defaultValue={loaderData.targetEmpId}
              className="mt-1 rounded-md border border-[#d8dee8] px-3 py-2 text-sm"
            />
          </div>
          <button className="rounded-md bg-[#1d2b40] px-3 py-2 text-xs font-semibold text-white">Load Devices</button>
          <button className="rounded-md border border-[#d8dee8] px-3 py-2 text-xs font-semibold text-[#1d2b40]">Refresh</button>
        </form>

        <div className="mt-3">
          <Form method="post" className="flex flex-wrap items-end gap-2" onSubmit={confirmBulkDeactivate}>
            <input type="hidden" name="action" value="deactivate_all" />
            <input type="hidden" name="emp_id" value={loaderData.targetEmpId} />
            <div>
              <label className="block text-xs font-semibold text-[#7c8ba1]">Reason (all devices)</label>
              <input
                name="reason"
                placeholder="e.g. lost phone / security incident"
                className="mt-1 rounded-md border border-[#d8dee8] px-3 py-2 text-xs"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || loaderData.devices.length === 0}
              className="rounded-md bg-[#9b1c1c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              Deactivate All Devices
            </button>
          </Form>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Registered Devices ({loaderData.devices.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">DEVICE ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DEVICE NAME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">PLATFORM</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">LAST ACTIVE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.devices.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.device_id || "-"}</td>
                  <td className="px-4 py-3">{row.device_name || "-"}</td>
                  <td className="px-4 py-3">{row.platform || "-"}</td>
                  <td className="px-4 py-3">{row.is_active ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3">{formatBangkokDateTime(row.last_active_at)}</td>
                  <td className="px-4 py-3">
                    {row.is_active ? (
                      <Form method="post" className="flex items-center gap-2">
                        <input type="hidden" name="action" value="deactivate" />
                        <input type="hidden" name="emp_id" value={loaderData.targetEmpId} />
                        <input type="hidden" name="device_id" value={row.device_id || ""} />
                        <input
                          name="reason"
                          placeholder="reason"
                          className="w-32 rounded-md border border-[#d8dee8] px-2 py-1 text-[11px]"
                          required
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting || !row.device_id}
                          className="rounded-md bg-[#1d2b40] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                      </Form>
                    ) : (
                      <span className="text-xs text-[#8a97ac]">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {loaderData.devices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#8a97ac]">No devices found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
