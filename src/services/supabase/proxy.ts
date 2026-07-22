import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";
import {
  getSafeRedirectPath,
  isGuestOnlyPath,
  isPrivatePath,
} from "@/utils/redirects";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let applyRefreshedCookies: (target: NextResponse) => void = () => undefined;
  const env = getPublicEnv();
  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          applyRefreshedCookies = (target) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              target.cookies.set(name, value, options),
            );
          };
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          applyRefreshedCookies(response);
          response.headers.set("Cache-Control", "private, no-store");
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated && isPrivatePath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      getSafeRedirectPath(`${pathname}${search}`),
    );
    const redirectResponse = NextResponse.redirect(loginUrl);
    applyRefreshedCookies(redirectResponse);
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
  }

  if (isAuthenticated && isGuestOnlyPath(pathname)) {
    const redirectResponse = NextResponse.redirect(new URL("/dashboard", request.url));
    applyRefreshedCookies(redirectResponse);
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
  }

  return response;
}
