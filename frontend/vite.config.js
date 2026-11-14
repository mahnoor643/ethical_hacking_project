import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The local Cloudflare Worker started with:
//   npx wrangler dev --persist-to ./.wrangler/state --port 8787
// Wrangler silently moves to another port (e.g. 8788) if 8787 is busy,
// so the target can be overridden: API_TARGET=http://127.0.0.1:8788
const API_TARGET = process.env.API_TARGET || "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        // Never hold a browser request forever if the Worker hangs.
        // Must exceed the Worker's worst case (2 x 15 s AI attempts).
        timeout: 60000,
        proxyTimeout: 60000,
        configure(proxy) {
          proxy.on("error", (err, req) => {
            console.error(
              `\n[api proxy] ${req.method} ${req.url} -> ${API_TARGET} failed: ${err.code || err.message}` +
                `\n[api proxy] Is "wrangler dev --port 8787" running? Check for another process on that port.\n`
            );
          });
        }
      }
    }
  }
});
