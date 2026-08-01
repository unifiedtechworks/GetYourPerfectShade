import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "../redirect";
import { getCognitoConfiguration } from "./config";
import { AUTH_COOKIES, clearAuthCookies, setSessionCookies } from "./cookies";
import { refreshSession } from "./client";
import { sessionFromCookies } from "./session";

function signInRedirect(request: NextRequest, error?: string) {
  const url = new URL("/sign-in", request.url);
  if (error) url.searchParams.set("error", error);
  if (request.nextUrl.pathname.startsWith("/app")) {
    url.searchParams.set(
      "next",
      safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`),
    );
  }
  return NextResponse.redirect(url);
}

export async function updateAuthSession(request: NextRequest) {
  const protectedRoute = request.nextUrl.pathname.startsWith("/app");
  const signInRoute = request.nextUrl.pathname === "/sign-in";
  if (!getCognitoConfiguration()) {
    return protectedRoute
      ? signInRedirect(request, "configuration")
      : NextResponse.next({ request });
  }

  let session = await sessionFromCookies(request.cookies);
  let refreshedTokens = null;
  const refreshToken = request.cookies.get(AUTH_COOKIES.refresh)?.value;
  if (!session && refreshToken) {
    refreshedTokens = await refreshSession(refreshToken);
    if (refreshedTokens?.AccessToken && refreshedTokens.IdToken) {
      session = await (async () => {
        const responseCookies = new Map<string, { value: string }>([
          [AUTH_COOKIES.access, { value: refreshedTokens.AccessToken! }],
          [AUTH_COOKIES.id, { value: refreshedTokens.IdToken! }],
        ]);
        return sessionFromCookies({ get: (name) => responseCookies.get(name) });
      })();
    }
  }

  if (!session && protectedRoute) {
    const response = signInRedirect(request);
    clearAuthCookies(response.cookies);
    return response;
  }
  if (session && signInRoute) return NextResponse.redirect(new URL("/app", request.url));

  const response = NextResponse.next({ request });
  if (session && refreshedTokens) setSessionCookies(response.cookies, refreshedTokens, refreshToken);
  return response;
}
