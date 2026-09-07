// Retire the former Wix URL without recreating content or redirecting its relevance.
export function GET() {
  return new Response("This events page has been permanently retired.\n", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex"
    }
  });
}
