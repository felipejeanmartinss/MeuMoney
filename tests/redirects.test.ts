import { describe, expect, it } from "vitest";
import { getSafeRedirectPath, isGuestOnlyPath, isPrivatePath } from "../src/utils/redirects";

describe("safe redirects", () => {
  it("preserves an internal destination", () => expect(getSafeRedirectPath("/settings/profile?from=login")).toBe("/settings/profile?from=login"));
  it("rejects protocol-relative and external destinations", () => {
    expect(getSafeRedirectPath("//evil.example")).toBe("/dashboard");
    expect(getSafeRedirectPath("https://evil.example")).toBe("/dashboard");
  });
  it.each(["/goals", "/goals/123", "/check-in", "/data-quality", "/reports", "/reports/saved/123", "/budgets", "/investments/benchmarks", "/imports", "/net-worth"])(
    "protects the integrated module %s", (pathname) => expect(isPrivatePath(pathname)).toBe(true),
  );
  it.each(["/goals-public", "/reports-public", "/check-in-preview", "/privacy", "/"])(
    "does not match a public route with a similar prefix: %s", (pathname) => expect(isPrivatePath(pathname)).toBe(false),
  );
  it("classifies private and guest-only routes", () => {
    expect(isPrivatePath("/dashboard")).toBe(true);
    expect(isPrivatePath("/accounts/new")).toBe(true);
    expect(isPrivatePath("/categories/123/edit")).toBe(true);
    expect(isPrivatePath("/transactions/new")).toBe(true);
    expect(isPrivatePath("/recurring-transactions/new")).toBe(true);
    expect(isPrivatePath("/transfers/123/edit")).toBe(true);
    expect(isPrivatePath("/credit-cards/123/invoices")).toBe(true);
    expect(isPrivatePath("/settings/profile")).toBe(true);
    expect(isPrivatePath("/login")).toBe(false);
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/update-password")).toBe(false);
  });
});
