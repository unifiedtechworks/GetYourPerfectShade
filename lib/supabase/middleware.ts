import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "../auth/redirect";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return request.nextUrl.pathname.startsWith("/app")
      ? NextResponse.redirect(new URL("/sign-in?error=configuration", request.url))
      : response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();
  const isProtected = request.nextUrl.pathname.startsWith("/app");

  if (isProtected && !user) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set(
      "next",
      safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`)
    );
    return NextResponse.redirect(signIn);
  }
  if (request.nextUrl.pathname === "/sign-in" && user) {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return response;
}
