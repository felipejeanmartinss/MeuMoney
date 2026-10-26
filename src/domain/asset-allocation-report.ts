import { formatInvestmentQuantity, INVESTMENT_CLASS_LABELS } from "./investments";
import { formatMoney } from "./money";
import type { InvestmentClass, SupportedCurrency } from "../types/database";

type AllocationAsset = { asset_name: string; current_value_minor: number; quantity?: string | number };
type AllocationGroup = { key: InvestmentClass; value: number; rows: AllocationAsset[] };

export function allocationShare(value: number, total: number): string {
  const percentage = total > 0 ? value / total * 100 : 0;
  return `${percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function allocationQuantityLabel(investmentClass: InvestmentClass, quantity?: string | number): string | null {
  if (quantity === undefined || quantity === null || quantity === "") return null;
  if (!["stock", "fund", "etf", "real_estate_fund"].includes(investmentClass)) return null;
  return `${formatInvestmentQuantity(quantity)} ${investmentClass === "stock" ? "ações" : "cotas"}`;
}

export function buildAssetAllocationText(currency: SupportedCurrency, total: number, groups: AllocationGroup[]): string {
  const lines = ["Alocação de ativos", `Moeda: ${currency}`, `Total: ${formatMoney(total, currency)}`, ""];

  if (!groups.length) lines.push("Nenhum investimento ativo nesta moeda.");

  for (const group of groups) {
    lines.push(`${INVESTMENT_CLASS_LABELS[group.key]} — ${formatMoney(group.value, currency)} (${allocationShare(group.value, total)})`);
    for (const asset of group.rows) {
      const quantity = allocationQuantityLabel(group.key, asset.quantity);
      lines.push(`  ${asset.asset_name}: ${formatMoney(asset.current_value_minor, currency)} (${allocationShare(asset.current_value_minor, total)})${quantity ? ` · ${quantity}` : ""}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
