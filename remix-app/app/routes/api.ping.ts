import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const isNetworkCheck = request.headers.get("X-Network-Check") === "true";

  return Response.json(
    {
      ok: true,
      status: isNetworkCheck ? "pong" : "healthy",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
