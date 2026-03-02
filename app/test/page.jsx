"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TestPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function loadData() {
      const { data, error } = await supabase
        .from("login_users")
        .select("*");

      console.log("RESULT:", data);

      setRows(data || []);
    }
    loadData();
  }, []);

  return (
    <div style={{ padding: "40px" }}>
      <h1>Test Supabase</h1>
      <pre>{JSON.stringify(rows, null, 2)}</pre>
    </div>
  );
}