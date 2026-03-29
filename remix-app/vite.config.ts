import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ command }) => {
  const useCloudflareRuntimeInDev = process.env.CLOUDFLARE_DEV_RUNTIME === "1";
  const useCloudflarePlugin = command === "build" || useCloudflareRuntimeInDev;

  return {
    server: {
      hmr: {
        overlay: false,
      },
      host: "localhost",
      port: 5173,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, ".."),
        // Force Vite to bundle .prisma/client/default -> wasm entry (workerd-compatible)
        // instead of leaving it as an unresolvable external on Cloudflare Workers
        ".prisma/client/default": path.resolve(
          __dirname,
          "../node_modules/.prisma/client/wasm.js"
        ),
      },
    },
    plugins: [
      ...(useCloudflarePlugin ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
      tailwindcss(),
      reactRouter(),
      tsconfigPaths(),
    ],
  };
});
