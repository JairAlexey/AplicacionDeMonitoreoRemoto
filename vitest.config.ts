import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/backend/config.ts",
        "src/backend/constants.ts",
        "src/backend/connection-manager.ts",
        "src/backend/local-proxy-server.ts",
        "src/backend/proxy-monitor.ts",
        "src/frontend/api/**/*.ts",
      ],
      exclude: ["**/__tests__/**", "**/*.d.ts"],
    },
  },
});
