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

const PRIVATE_ROUTES = [
  "/dashboard", "/accounts", "/categories", "/transactions",
  "/recurring-transactions", "/transfers", "/credit-cards", "/settings",
  "/budgets", "/imports", "/investments", "/net-worth", "/reports",
  "/goals", "/check-in", "/data-quality",
] as const;

export function isPrivatePath(pathname: string) {
  return PRIVATE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function isGuestOnlyPath(pathname: string) {
  return ["/login", "/register", "/forgot-password"].includes(pathname);
}
