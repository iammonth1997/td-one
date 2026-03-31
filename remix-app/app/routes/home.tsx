import type { Route } from "./+types/home";
import { redirect } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TD One ERP" },
    { name: "description", content: "TD One ERP authentication portal" },
  ];
}

export function loader({ request }: Route.LoaderArgs) {
  const { hostname } = new URL(request.url);
  const isLocalTest = hostname === "localhost" || hostname === "127.0.0.1";

  throw redirect(isLocalTest ? "/admin-login" : "/login");
}

export default function Home() {
  return null;
}
