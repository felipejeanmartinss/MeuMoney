import { describe, expect, it } from "vitest";
import { getSafeRedirectPath, isGuestOnlyPath, isPrivatePath } from "../src/utils/redirects";

describe("safe redirects", () => {
  it("preserves an internal destination", () => expect(getSafeRedirectPath("/settings/profile?from=login")).toBe("/settings/profile?from=login"));
  it("rejects protocol-relative and external destinations", () => {
    expect(getSafeRedirectPath("//evil.example")).toBe("/dashboard");
    expect(getSafeRedirectPath("https://evil.example")).toBe("/dashboard");
  });
  it("classifies private and guest-only routes", () => {
    expect(isPrivatePath("/dashboard")).toBe(true);
    expect(isPrivatePath("/accounts/new")).toBe(true);
    expect(isPrivatePath("/categories/123/edit")).toBe(true);
    expect(isPrivatePath("/settings/profile")).toBe(true);
    expect(isPrivatePath("/login")).toBe(false);
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/update-password")).toBe(false);
  });
});
