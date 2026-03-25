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
    // Use Hyperdrive connection string if available, fallback to DATABASE_URL
    const connectionString = (env as any).HYPERDRIVE?.connectionString ?? (env as any).DATABASE_URL;
    if (connectionString) {
      process.env.DATABASE_URL = connectionString;
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
