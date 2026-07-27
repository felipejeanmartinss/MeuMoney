import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverPagesUsingFormStyles = [
  resolve("src", "app", "imports", "[id]", "page.tsx"),
  resolve("src", "app", "recurring-transactions", "page.tsx"),
  resolve("src", "app", "transactions", "page.tsx"),
  resolve("src", "app", "transfers", "page.tsx"),
];

describe("Server Component boundaries", () => {
  it.each(serverPagesUsingFormStyles)(
    "%s imports form styles from the server-safe module",
    (pagePath) => {
      const source = readFileSync(pagePath, "utf8");

      expect(source).toContain(
        'from "@/components/forms/form-control-styles"',
      );
      expect(source).not.toContain(
        'from "@/components/forms/form-controls"',
      );
    },
  );

  it("keeps the shared form style helper free of the client directive", () => {
    const source = readFileSync(
      resolve("src", "components", "forms", "form-control-styles.ts"),
      "utf8",
    );

    expect(source).not.toContain('"use client"');
  });
});
