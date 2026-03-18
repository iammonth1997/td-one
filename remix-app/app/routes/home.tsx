import type { Route } from "./+types/home";
import { redirect } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TD One ERP" },
    { name: "description", content: "TD One ERP authentication portal" },
  ];
}

export function loader() {
  throw redirect("/login");
}

export default function Home() {
  return null;
}
