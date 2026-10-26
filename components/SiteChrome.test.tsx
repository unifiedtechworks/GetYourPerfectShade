import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteChrome } from "./SiteChrome";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/components/Header", () => ({ Header: () => <header>Public header</header> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer>Public footer</footer> }));

describe("public typography boundary", () => {
  it.each([
    "/sign-in", "/forgot-password", "/reset-password", "/auth/callback",
    "/auth/mfa/select", "/auth/mfa/setup", "/auth/mfa/verify", "/auth/mfa/email",
    "/auth/new-password", "/app", "/app/account", "/app/estimates/new",
    "/app/estimates/example", "/app/estimates/example/preview"
  ])("leaves %s without public typography or chrome", (pathname) => {
    route.pathname = pathname;
    expect(renderToStaticMarkup(<SiteChrome><main>Application content</main></SiteChrome>))
      .toBe("<main>Application content</main>");
  });

  it.each([
    "/", "/about", "/contact", "/gallery", "/gallery/window-coverings",
    "/gallery/exterior-solutions"
  ])("wraps %s in the public theme", (pathname) => {
    route.pathname = pathname;
    const html = renderToStaticMarkup(<SiteChrome><main>Public content</main></SiteChrome>);
    expect(html).toMatch(/^<div class="[^"]+"><header>Public header<\/header>/);
    expect(html).toContain("<main>Public content</main><footer>Public footer</footer></div>");
  });
});
