import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "infra/bin/**",
      "infra/lib/**",
      "infra/test/**",
      "infra/node_modules/**",
      "infra/cdk.out/**",
      "node_modules/**",
      ".next/**",
      ".worktrees/**",
    ],
  },
});
