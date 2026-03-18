import { Form, redirect } from "react-router";
import type { Route } from "./+types/day-work";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  if (session.login_context === "admin_portal") {
    throw redirect("/dashboard");
  }

  return {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
  };
}

export default function DayWorkSelectPage({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-md rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.10)] sm:max-w-lg sm:p-7">
        <h1 className="text-2xl font-bold text-[#DC2626] sm:text-3xl">Day Work Summary</h1>

        <Form method="get" action="/day-work/view" className="mt-6 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#555555]">Year</label>
            <select
              name="year"
              defaultValue={loaderData.currentYear}
              className="block w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#DC2626]"
            >
              {Array.from({ length: 5 }, (_, index) => loaderData.currentYear - 2 + index).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-[#555555]">Month</label>
            <select
              name="month"
              defaultValue={loaderData.currentMonth}
              className="block w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#DC2626]"
            >
              {[
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ].map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="mt-7 w-full rounded-xl bg-[#DC2626] px-4 py-3 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B] active:scale-[0.99]"
          >
            View summary
          </button>
        </Form>
      </section>
    </main>
  );
}
