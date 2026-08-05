import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function source(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

describe("integrated AWS provider boundary", () => {
  it("uses the Cognito account session for estimate bearer identity", () => {
    const identity = source("lib/aws/api/estimate-identity.ts");
    expect(identity).toContain("requireOrganizationAccount");
    expect(identity).not.toMatch(/supabase/i);
  });

  it("has no active Supabase package, environment, client, or migration", () => {
    const packageManifest = JSON.parse(source("package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(packageManifest.dependencies ?? {})).not.toEqual(
      expect.arrayContaining(["@supabase/ssr", "@supabase/supabase-js"]),
    );
    expect(source(".env.example")).not.toMatch(/SUPABASE/);
    expect(existsSync(join(repositoryRoot, "lib/supabase/server.ts"))).toBe(false);
    expect(existsSync(join(repositoryRoot, "lib/supabase/middleware.ts"))).toBe(false);
    expect(existsSync(join(
      repositoryRoot,
      "supabase/migrations/202607260001_account_foundation.sql",
    ))).toBe(false);
    expect(existsSync(join(
      repositoryRoot,
      "supabase/migrations/202607260002_estimate_phase_1.sql",
    ))).toBe(false);
  });

  it("keeps public staff registration absent", () => {
    expect(existsSync(join(repositoryRoot, "app/sign-up/page.tsx"))).toBe(false);
    expect(existsSync(join(repositoryRoot, "app/sign-up/route.ts"))).toBe(false);
  });

  it("uses one public API URL contract for account and estimate clients", () => {
    expect(source("lib/auth/cognito/config.ts")).toContain(
      "NEXT_PUBLIC_API_BASE_URL",
    );
    expect(source("lib/aws/api/estimate-client.ts")).toContain(
      "getCognitoConfiguration()?.apiBaseUrl",
    );
    expect(source("lib/aws/api/estimate-client.ts")).not.toContain(
      "ESTIMATE_API_BASE_URL",
    );
  });

  it("protects the estimate editor with the existing server identity boundary", () => {
    const page = source("app/app/estimates/[estimateId]/page.tsx");
    const action = source("app/app/estimates/actions.ts");
    expect(page).toContain("requireEstimateApiIdentity");
    expect(action).toContain("requireEstimateApiIdentity");
    expect(page).not.toMatch(/organizationId|actorId|AWS_ACCESS_KEY/i);
  });
});
