"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/sidebar";
import Header from "../components/Header";

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const s = localStorage.getItem("tdone_session");
      if (!s) {
        router.push("/login");
        return;
      }
      const parsed = JSON.parse(s);
      setSession(parsed);
    } catch (err) {
      console.error("Failed to parse session from localStorage:", err);
      localStorage.removeItem("tdone_session");
      router.push("/login");
      return;
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-gray-800 rounded mb-2"></div>
          <div className="h-4 w-64 bg-gray-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex bg-black min-h-screen text-white">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <Header />

        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Welcome, {session.emp_id || session.user?.emp_id || 'User'}</h1>
            <p className="text-gray-300 text-sm">Role: {session.role || '—'}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#111827] p-6 rounded-xl border border-red-700 shadow-xl hover:scale-[1.02] transition">
              <h3 className="text-xl font-bold text-red-500">Check Day Work</h3>
              <p className="text-gray-300 text-sm mt-2">ดูเวลาทำงานประจำวัน</p>
            </div>

            <div className="bg-[#111827] p-6 rounded-xl border border-red-700 shadow-xl hover:scale-[1.02] transition">
              <h3 className="text-xl font-bold text-red-500">Check OT</h3>
              <p className="text-gray-300 text-sm mt-2">ตรวจสอบ OT ของคุณ</p>
            </div>

            <div className="bg-[#111827] p-6 rounded-xl border border-red-700 shadow-xl hover:scale-[1.02] transition">
              <h3 className="text-xl font-bold text-red-500">Slip</h3>
              <p className="text-gray-300 text-sm mt-2">ดูเงินเดือน & Incentive</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}