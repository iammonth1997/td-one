"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function TestPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem("tdone_session");
      if (!s) { router.push("/login"); return; }
      const session = JSON.parse(s);
      if (session?.role !== "admin") { router.push("/dashboard"); return; }
    } catch {
      router.push("/login");
      return;
    }

    setAuthed(true);

    async function loadData() {
      const { data } = await supabase.from("login_users").select("emp_id, is_registered, role");
      setRows(data || []);
    }
    loadData();
  }, [router]);

  if (!authed) return null;

  return (
    <div style={{ padding: "40px" }}>
      <h1>Test Supabase (Admin Only)</h1>
      <pre>{JSON.stringify(rows, null, 2)}</pre>
    </div>
  );
}
