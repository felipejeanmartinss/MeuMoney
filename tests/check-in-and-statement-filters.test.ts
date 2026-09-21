import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) => readFileSync(resolve(...segments), "utf8");

describe("check-in and statement review filters", () => {
  it("does not expose inactive account entries in the statement source", () => {
    const service = readSource("src", "services", "finance", "accounts-service.ts");
    expect(service.match(/\.eq\("is_active", true\)/g)).toHaveLength(2);
  });

  it("limits check-in counts to manual/current-month items", () => {
    const service = readSource("src", "services", "finance", "monthly-checkins-service.ts");
    expect(service).toContain('.eq("origin_type", "manual")');
    expect(service).toContain('.gte("transaction_date", referenceMonth)');
    expect(service).toContain('.lt("transaction_date", monthEnd)');
  });

  it("offers a direct review filter for uncategorized transactions", () => {
    const page = readSource("src", "app", "transactions", "page.tsx");
    const service = readSource("src", "services", "finance", "transactions-service.ts");
    expect(page).toContain("Revisar sem categoria");
    expect(page).toContain("uncategorized=true");
    expect(service).toContain('.is("category_id", null)');
  });

  it("provides a select-all action in report checkbox filters", () => {
    const filter = readSource("src", "components", "reports", "checkbox-filter.tsx");
    expect(filter).toContain("Selecionar todas");
    expect(filter).toContain("setCheckedValues(new Set(options.map");
  });
});
