import assert from "node:assert/strict";

// Run against a locally started production build: node scripts/check-public-launch.mjs [origin]
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3210");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname),
  "This smoke check is restricted to local servers.");
const canonicalOrigin = "https://www.getyourperfectshade.com";
const publicPaths = [
  "/", "/about", "/contact", "/gallery",
  "/gallery/window-coverings?product=roller-shades",
  "/gallery/exterior-solutions?product=awnings"
];

for (const path of publicPaths) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  assert.equal(response.status, 200, path);
  const html = await response.text();
  const pathname = new URL(path, origin).pathname;
  const canonical = canonicalOrigin + (pathname === "/" ? "" : pathname);
  assert.ok(html.includes('rel="canonical" href="' + canonical + '"'), path + " canonical");
  assert.ok(html.includes('property="og:url" content="' + canonical + '"'), path + " OG");
  const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)];
  const schema = scripts.map((match) => JSON.parse(match[1]))
    .find((item) => item["@type"] === "LocalBusiness");
  assert.equal(schema?.url, canonicalOrigin, path + " schema");
  assert.equal(schema?.email, "ps.getyourperfectshade@gmail.com", path + " schema email");
  assert.doesNotMatch(html, /ps\.perfectshade@gmail\.com|https:\/\/getyourperfectshade\.com/i);
  console.log("PASS", path, "200; canonical, OG, schema, and contact");
}

const legacy = await fetch(new URL("/products?product=roller-shades&utm_source=wix", origin),
  { redirect: "manual" });
assert.equal(legacy.status, 308);
assert.equal(new URL(legacy.headers.get("location"), origin).pathname, "/gallery");
assert.equal(new URL(legacy.headers.get("location"), origin).search,
  "?product=roller-shades&utm_source=wix");
console.log("PASS /products 308 with query preserved");

for (const method of ["GET", "HEAD"]) {
  const retired = await fetch(new URL("/events", origin), { method, redirect: "manual" });
  assert.equal(retired.status, 410);
  assert.equal(retired.headers.get("location"), null);
  assert.equal(retired.headers.get("x-robots-tag"), "noindex");
}
console.log("PASS /events GET and HEAD 410; no redirect");

const sitemapResponse = await fetch(new URL("/sitemap.xml", origin));
assert.equal(sitemapResponse.status, 200);
const sitemap = await sitemapResponse.text();
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert.equal(urls.length, 6);
assert.ok(urls.every((url) => new URL(url).origin === canonicalOrigin));
assert.ok(urls.includes(canonicalOrigin + "/gallery"));
assert.ok(urls.includes(canonicalOrigin + "/gallery/window-coverings"));
assert.ok(urls.includes(canonicalOrigin + "/gallery/exterior-solutions"));
assert.doesNotMatch(sitemap, /\/(products|events|app|sign-in)(?:<|\/|\?)/);
const robotsResponse = await fetch(new URL("/robots.txt", origin));
assert.equal(robotsResponse.status, 200);
assert.ok((await robotsResponse.text()).includes("Sitemap: " + canonicalOrigin + "/sitemap.xml"));
console.log("PASS canonical sitemap and robots");

for (const [path, status] of [["/sign-in", 200], ["/sign-up", 404]]) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  assert.equal(response.status, status, path);
  console.log("PASS", path, status);
}
