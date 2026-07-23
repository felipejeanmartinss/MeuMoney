const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

export function getSafeRedirectPath(
  candidate: string | null | undefined,
  fallback = DEFAULT_AUTHENTICATED_PATH,
) {
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) return fallback;

  try {
    const parsed = new URL(candidate, "https://meumoney.local");
    if (parsed.origin !== "https://meumoney.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function isPrivatePath(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname === "/accounts" ||
    pathname.startsWith("/accounts/") ||
    pathname === "/categories" ||
    pathname.startsWith("/categories/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

export function isGuestOnlyPath(pathname: string) {
  return ["/login", "/register", "/forgot-password"].includes(pathname);
}
