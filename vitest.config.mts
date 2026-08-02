import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "infra/**",
      "node_modules/**",
      ".next/**",
      ".worktrees/**",
    ],
  },
});
