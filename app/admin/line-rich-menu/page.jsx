"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { useSession } from "@/app/hooks/useSession";

export default function LineRichMenuAdmin() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession();
  const { t } = useLanguage();

  const [menuType, setMenuType] = useState("employee");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [menus, setMenus] = useState([]);
  const [loadingMenus, setLoadingMenus] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session || !["admin", "super_admin", "hr_payroll", "hr-payroll"].includes(session.role?.toLowerCase())) {
      router.replace("/login");
      return;
    }
    loadRichMenus();
  }, [loading, session, router]);

  async function loadRichMenus() {
    setLoadingMenus(true);
    try {
      const res = await fetch("/api/line/rich-menu", { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok && data.success) {
        setMenus(data.richMenus || []);
      }
    } catch (err) {
      console.error("Failed to load menus:", err);
    } finally {
      setLoadingMenus(false);
    }
  }

  async function deployRichMenu() {
    setUploading(true);
    setMessage("");

    try {
      // Create a simple SVG image as placeholder
      const svg = createMenuImage(menuType);
      const imageBase64 = btoa(svg);

      const payload = {
        action: "create_and_set_default",
        imageContentType: "image/svg+xml",
        imageBase64,
        richMenu: {
          size: { width: 2500, height: menuType === "employee" ? 1686 : 843 },
          selected: true,
          name: menuType === "employee" ? "TD One Employee Menu" : "TD One Admin Menu",
          chatBarText: menuType === "employee" ? "TD One ERP" : "TD One Admin",
          areas: getMenuAreas(menuType),
        },
      };

      const res = await fetch("/api/line/rich-menu", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage(`✅ Rich Menu deployed successfully! ID: ${data.richMenuId}`);
        loadRichMenus();
      } else {
        setMessage(`❌ Error: ${data.error || "Failed to deploy menu"}`);
      }
    } catch (err) {
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  function getMenuAreas(type) {
    if (type === "employee") {
      return [
        // Row 1 - Top row (3 items)
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/dashboard` },
        },
        {
          bounds: { x: 833, y: 0, width: 833, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/scan` },
        },
        {
          bounds: { x: 1666, y: 0, width: 834, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/slip` },
        },
        // Row 2 - Bottom row (3 items)
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/request/leave` },
        },
        {
          bounds: { x: 833, y: 843, width: 833, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/request/ot` },
        },
        {
          bounds: { x: 1666, y: 843, width: 834, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/request/time-correction` },
        },
      ];
    } else {
      return [
        {
          bounds: { x: 0, y: 0, width: 625, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/dashboard` },
        },
        {
          bounds: { x: 625, y: 0, width: 625, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/attendance` },
        },
        {
          bounds: { x: 1250, y: 0, width: 625, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/payroll` },
        },
        {
          bounds: { x: 1875, y: 0, width: 625, height: 843 },
          action: { type: "uri", uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/admin/pin-reset-audit` },
        },
      ];
    }
  }

  function createMenuImage(type) {
    if (type === "employee") {
      return `<svg width="2500" height="1686" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#082A5C;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#0D3B7A;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="2500" height="1686" fill="url(#grad1)"/>
        
        <!-- Row 1 -->
        <rect x="0" y="0" width="833" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="416" y="420" font-size="80" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">📊</text>
        <text x="416" y="550" font-size="60" fill="white" text-anchor="middle">Dashboard</text>
        
        <rect x="833" y="0" width="834" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="1250" y="420" font-size="80" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">✍️</text>
        <text x="1250" y="550" font-size="60" fill="white" text-anchor="middle">Check-in/out</text>
        
        <rect x="1667" y="0" width="833" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="2084" y="420" font-size="80" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">📄</text>
        <text x="2084" y="550" font-size="60" fill="white" text-anchor="middle">My Slip</text>
        
        <!-- Row 2 -->
        <rect x="0" y="843" width="833" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="416" y="1263" font-size="80" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">📋</text>
        <text x="416" y="1393" font-size="60" fill="white" text-anchor="middle">Leave</text>
        
        <rect x="833" y="843" width="834" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="1250" y="1263" font-size="80" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">⏰</text>
        <text x="1250" y="1393" font-size="60" fill="white" text-anchor="middle">OT Request</text>
        
        <rect x="1667" y="843" width="833" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="2084" y="1263" font-size="80" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">🕒</text>
        <text x="2084" y="1393" font-size="60" fill="white" text-anchor="middle">Time Correct</text>
      </svg>`;
    } else {
      return `<svg width="2500" height="843" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0D3B7A;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1352A3;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="2500" height="843" fill="url(#grad2)"/>
        
        <rect x="0" y="0" width="625" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="312" y="421" font-size="60" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">📊</text>
        <text x="312" y="550" font-size="40" fill="white" text-anchor="middle">Dashboard</text>
        
        <rect x="625" y="0" width="625" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="937" y="421" font-size="60" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">👥</text>
        <text x="937" y="550" font-size="40" fill="white" text-anchor="middle">Attendance</text>
        
        <rect x="1250" y="0" width="625" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="1562" y="421" font-size="60" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">💰</text>
        <text x="1562" y="550" font-size="40" fill="white" text-anchor="middle">Payroll</text>
        
        <rect x="1875" y="0" width="625" height="843" fill="none" stroke="#ffffff" stroke-width="2"/>
        <text x="2187" y="421" font-size="60" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">⚙️</text>
        <text x="2187" y="550" font-size="40" fill="white" text-anchor="middle">Admin</text>
      </svg>`;
    }
  }

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 sm:p-7">
          <h1 className="text-2xl font-bold text-[#1352A3]">LINE Rich Menu Manager</h1>
          <p className="text-sm text-[#6B7A99] mt-2">Deploy rich menus to LINE users</p>
        </div>

        <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 sm:p-7 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#334260] mb-2">Select Menu Type</label>
            <select
              value={menuType}
              onChange={(e) => setMenuType(e.target.value)}
              className="w-full rounded-lg border border-[#D0D8E4] px-3 py-2"
            >
              <option value="employee">Employee Menu (2 rows x 3 columns)</option>
              <option value="admin">Admin Menu (1 row x 4 columns)</option>
            </select>
          </div>

          <button
            onClick={deployRichMenu}
            disabled={uploading}
            className="w-full rounded-lg bg-[#1352A3] px-4 py-2.5 text-white font-semibold disabled:opacity-50 hover:bg-[#0D3B7A]"
          >
            {uploading ? "Deploying..." : "Deploy to LINE"}
          </button>

          {message && (
            <div
              className={`rounded-lg p-3 text-sm ${
                message.includes("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 sm:p-7 space-y-4">
          <h2 className="font-bold text-[#1352A3]">Active Rich Menus</h2>
          {loadingMenus ? (
            <p className="text-sm text-[#6B7A99]">Loading...</p>
          ) : menus.length > 0 ? (
            <div className="space-y-2">
              {menus.map((menu) => (
                <div key={menu.richMenuId} className="rounded-lg border border-[#E5EAF0] p-3 bg-[#F8FAFD]">
                  <p className="font-semibold text-[#334260]">{menu.name || menu.richMenuId}</p>
                  <p className="text-xs text-[#6B7A99]">ID: {menu.richMenuId}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6B7A99]">No rich menus found</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 sm:p-7 space-y-3">
          <h2 className="font-bold text-[#1352A3]">Menu Details</h2>
          <div className="text-sm text-[#6B7A99] space-y-2">
            {menuType === "employee" ? (
              <>
                <p><strong>Row 1 (Top):</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>📊 Dashboard - View work summary</li>
                  <li>✍️ Check-in/out - Quick attendance</li>
                  <li>📄 My Slip - View salary slip</li>
                </ul>
                <p className="pt-2"><strong>Row 2 (Bottom):</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>📋 Leave Request - Request leave</li>
                  <li>⏰ OT Request - Request overtime</li>
                  <li>🕒 Time Correction - Correct work time</li>
                </ul>
              </>
            ) : (
              <>
                <ul className="list-disc list-inside space-y-1">
                  <li>📊 Dashboard - View admin summary</li>
                  <li>👥 Attendance - Manage attendance</li>
                  <li>💰 Payroll - Payroll management</li>
                  <li>⚙️ Admin - Admin settings</li>
                </ul>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
