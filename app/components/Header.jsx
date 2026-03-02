"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Header() {
  const router = useRouter();
  const [empId, setEmpId] = useState(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("tdone_session");
      if (s) {
        const parsed = JSON.parse(s);
        setEmpId(parsed.emp_id || parsed.user?.emp_id || null);
      }
    } catch (err) {
      console.error("Header: failed to read session", err);
    }
  }, []);

  function handleLogout() {
    try {
      localStorage.removeItem("tdone_session");
    } catch (e) {
      console.error("Failed to remove session:", e);
    }
    router.push("/login");
  }

  return (
    <div className="w-full bg-[#0f0f0f] border-b border-red-700 p-4 flex justify-between items-center shadow-lg">
      <div>
        <h2 className="text-xl font-bold">Dashboard</h2>
        {empId && <div className="text-sm text-gray-300">{empId}</div>}
      </div>

      <button
        className="bg-red-700 hover:bg-red-800 px-4 py-2 rounded transition"
        onClick={handleLogout}
      >
        Logout
      </button>
    </div>
  );
}