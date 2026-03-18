import { Link } from "react-router";
import type { Route } from "./+types/request";
import { requireSession } from "~/lib/require-session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSession(request, context);
  return null;
}

const cards = [
  { title: "Leave Request", href: "/request/leave", desc: "Submit and track leave requests" },
  { title: "OT Request", href: "/request/ot", desc: "Submit overtime requests" },
  { title: "Time Correction", href: "/request/time-correction", desc: "Request time corrections" },
];

export default function RequestPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-4xl">
        <h1 className="mb-4 text-2xl font-bold text-[#111111]">Request Center</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              to={card.href}
              className="rounded-2xl border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)] hover:border-[#DC2626]"
            >
              <h2 className="text-lg font-semibold text-[#111111]">{card.title}</h2>
              <p className="mt-2 text-sm text-[#555555]">{card.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
