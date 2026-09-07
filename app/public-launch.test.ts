import { describe, expect, it, vi } from "vitest";
import { businessInfo } from "../data/business";
import config from "../next.config";
import { GET } from "./events/route";
import sitemap from "./sitemap";
import robots from "./robots";
import { LocalBusinessJsonLd } from "../components/LocalBusinessJsonLd";

vi.mock("@/data/business", async () => import("../data/business"));

describe("public production launch contract", () => {
  it("uses the approved canonical origin and customer contact", () => {
    expect(businessInfo.url).toBe("https://www.getyourperfectshade.com");
    expect(businessInfo.email).toBe("ps.getyourperfectshade@gmail.com");
    expect(businessInfo.emailHref).toBe("mailto:ps.getyourperfectshade@gmail.com");
  });

  it("permanently redirects only the old products path to Products Offered", async () => {
    const redirects = await config.redirects!();
    expect(redirects).toContainEqual({
      source: "/products",
      destination: "/gallery",
      permanent: true
    });
    expect(redirects.some(({ source }) => source === "/gallery" || source === "/events"))
      .toBe(false);
  });

  it("retires events with a genuine Gone response and no redirect", async () => {
    const response = GET();
    expect(response.status).toBe(410);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(await response.text()).toContain("permanently retired");
  });

  it("lists only intended canonical public routes, excluding retired and protected URLs", () => {
    expect(sitemap().map(({ url }) => url)).toEqual([
      "https://www.getyourperfectshade.com",
      "https://www.getyourperfectshade.com/gallery",
      "https://www.getyourperfectshade.com/gallery/window-coverings",
      "https://www.getyourperfectshade.com/gallery/exterior-solutions",
      "https://www.getyourperfectshade.com/about",
      "https://www.getyourperfectshade.com/contact"
    ]);
  });

  it("points crawlers at the canonical sitemap and preserves protected exclusions", () => {
    expect(robots()).toMatchObject({
      sitemap: "https://www.getyourperfectshade.com/sitemap.xml",
      rules: {
        disallow: ["/app", "/auth", "/sign-in", "/forgot-password", "/reset-password"]
      }
    });
  });

  it("emits the canonical origin and approved email in LocalBusiness JSON-LD", () => {
    const element = LocalBusinessJsonLd();
    const schema = JSON.parse(element.props.dangerouslySetInnerHTML.__html);
    expect(schema).toMatchObject({
      "@type": "LocalBusiness",
      url: "https://www.getyourperfectshade.com",
      email: "ps.getyourperfectshade@gmail.com"
    });
  });
});
