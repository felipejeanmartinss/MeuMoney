import { describe, expect, it } from "vitest";
import { allocationQuantityLabel, allocationShare, buildAssetAllocationText } from "../src/domain/asset-allocation-report";

describe("resumo de alocação de ativos", () => {
  it("exports the total, category and every asset in the selected currency", () => {
    const content = buildAssetAllocationText("BRL", 10_000, [
      { key: "fixed_income", value: 7_500, rows: [{ asset_name: "Tesouro Selic", current_value_minor: 7_500 }] },
      { key: "pension", value: 2_500, rows: [{ asset_name: "Tegra", current_value_minor: 2_500 }] },
    ]);

    expect(content).toContain("Moeda: BRL");
    expect(content).toContain("Total: R$ 100,00");
    expect(content).toContain("Renda fixa — R$ 75,00 (75,0%)");
    expect(content).toContain("  Tegra: R$ 25,00 (25,0%)");
    expect(content.endsWith("\n")).toBe(true);
  });

  it("keeps the empty state and avoids dividing by zero", () => {
    expect(allocationShare(0, 0)).toBe("0,0%");
    expect(buildAssetAllocationText("USD", 0, [])).toContain("Nenhum investimento ativo nesta moeda.");
  });

  it("shows shares and real-estate fund units in the allocation and export", () => {
    expect(allocationQuantityLabel("stock", "100.5")).toBe("100,5 ações");
    expect(allocationQuantityLabel("real_estate_fund", "42")).toBe("42 cotas");
    expect(allocationQuantityLabel("etf", "3")).toBe("3 cotas");
    expect(allocationQuantityLabel("fixed_income", "12")).toBeNull();
    const content = buildAssetAllocationText("BRL", 10_000, [
      { key: "stock", value: 10_000, rows: [{ asset_name: "VALE3", current_value_minor: 10_000, quantity: "10" }] },
    ]);
    expect(content).toContain("VALE3: R$ 100,00 (100,0%) · 10 ações");
  });
});
