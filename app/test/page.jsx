"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { readStoredSession } from "@/lib/clientSession";

export default function TestPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const session = typeof window === "undefined" ? null : readStoredSession("admin_portal");
  const authed = session?.role === "admin";

  useEffect(() => {
    if (!session) {
      router.push("/admin/login");
      return;
    }

    if (session?.role !== "admin") { router.push("/dashboard"); return; }

    async function loadData() {
      const { data } = await supabase.from("login_users").select("emp_id, is_registered, role");
      setRows(data || []);
    }
    loadData();
  }, [router, session]);

  if (!authed) return null;

  return (
    <div style={{ padding: "40px" }}>
      <h1>Test Supabase (Admin Only)</h1>
      <pre>{JSON.stringify(rows, null, 2)}</pre>
    </div>
  );
}
