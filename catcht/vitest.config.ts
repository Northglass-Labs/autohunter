import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // `.env.local` is a 1Password FIFO mount. Unit tests do not need production secrets,
  // and asking Vite to load the FIFO can block the runner waiting for a writer.
  envDir: false,
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**"],
    coverage: { reporter: ["text", "json-summary"] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
    },
  },
});
