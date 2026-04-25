// Polyfill Node.js globals for Prisma Client in Cloudflare Workers
(globalThis as any).__dirname = "/";

import { createRequestHandler } from "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    const hyperdrive = (env as any).HYPERDRIVE;
    const hyperdriveUrl = hyperdrive?.connectionString;
    const directDatabaseUrl = (env as any).DATABASE_URL;
    console.log("[worker] HYPERDRIVE binding:", hyperdrive ? "present" : "MISSING");

    const isLocalProxy = hyperdriveUrl?.includes('.hyperdrive.local');
    const connectionString = hyperdriveUrl ?? directDatabaseUrl ?? null;

    console.log("[worker] local proxy:", isLocalProxy ? "yes (using Hyperdrive binding)" : "no");
    console.log("[worker] connectionString:", connectionString ? connectionString.replace(/:[^@]+@/, ":***@") : "MISSING");
    if (connectionString) {
      process.env.DATABASE_URL = connectionString;
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
