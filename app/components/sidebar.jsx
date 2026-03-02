"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Sidebar() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("tdone_session");
      if (s) setSession(JSON.parse(s));
    } catch (err) {
      console.error("Sidebar: failed to parse session", err);
    }
  }, []);

  return (
    <aside className="bg-[#111827] border-r border-red-700 w-64 h-screen p-6 flex flex-col">
      <Link href="/dashboard" className="text-2xl font-bold text-red-500 mb-10 block">
        TD One ERP
      </Link>

      <nav className="flex flex-col text-gray-300 gap-4">
        <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
        <Link href="/attendance" className="hover:text-white">Attendance</Link>
        <Link href="/payroll" className="hover:text-white">Payroll</Link>
        <Link href="/slip" className="hover:text-white">My Slip</Link>
      </nav>

      <div className="mt-auto text-sm text-gray-400">
        Logged in as:
        <div className="text-white">{session?.emp_id || '-'}</div>
      </div>
    </aside>
  );
}