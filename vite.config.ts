import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const convexUrl = env.VITE_CONVEX_URL || "http://127.0.0.1:3210";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Only on localhost: Tailscale serves it to the TailNet over HTTPS at
      // https://<machine>.<tailnet>.ts.net:5173 (see README).
      host: env.HOST || "127.0.0.1",
      port: Number(env.PORT || 5173),
      strictPort: true,
      allowedHosts: true,
      // The browser talks to Convex through this server, so only one port has
      // to be reachable and the local Convex backend can stay on 127.0.0.1.
      proxy: {
        "/api": { target: convexUrl, ws: true, changeOrigin: true },
      },
    },
    preview: {
      host: env.HOST || "127.0.0.1",
      port: Number(env.PORT || 5173),
      allowedHosts: true,
      proxy: {
        "/api": { target: convexUrl, ws: true, changeOrigin: true },
      },
    },
  };
});
