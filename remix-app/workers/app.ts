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
    console.log("[worker] HYPERDRIVE binding:", hyperdrive ? "present" : "MISSING");

    // In local dev, Hyperdrive creates a .hyperdrive.local proxy that pg cannot connect to
    // (pg uses Node.js TCP while Workers runtime uses Cloudflare TCP API).
    // Detect this and fall back to the direct DATABASE_URL var instead.
    const isLocalProxy = hyperdriveUrl?.includes('.hyperdrive.local');
    const connectionString = isLocalProxy
      ? ((env as any).DATABASE_URL ?? hyperdriveUrl)
      : (hyperdriveUrl ?? (env as any).DATABASE_URL);

    console.log("[worker] local proxy:", isLocalProxy ? "yes (using DATABASE_URL)" : "no (using Hyperdrive)");
    console.log("[worker] connectionString:", connectionString ? connectionString.replace(/:[^@]+@/, ":***@") : "MISSING");
    if (connectionString) {
      process.env.DATABASE_URL = connectionString;
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
