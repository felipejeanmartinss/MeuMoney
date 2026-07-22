import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/services/supabase/server";
import { getSafeRedirectPath } from "@/utils/redirects";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeRedirectPath(url.searchParams.get("next"));
  if (!code) return NextResponse.redirect(new URL("/auth/status?state=invalid", url.origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/auth/status?state=invalid", url.origin));
  if (next === "/update-password") return NextResponse.redirect(new URL(next, url.origin));

  const statusUrl = new URL("/auth/status", url.origin);
  statusUrl.searchParams.set("state", "confirmed");
  statusUrl.searchParams.set("next", next);
  return NextResponse.redirect(statusUrl);
}
