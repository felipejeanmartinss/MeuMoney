import { getCardReportCompetenceMonth } from "./credit-cards";
import { coerceMinorUnits } from "./money";

type CardPurchase = {
  id: string;
  entry_kind: "purchase" | "refund" | "cashback";
  purchase_date: string;
  status: "active" | "cancelled";
};

type CardInstallment = {
  purchase_id: string;
  credit_card_id: string;
  installment_number: number;
  amount: number;
  status: string;
};

type CardPayment = {
  credit_card_id: string;
  amount_minor: number;
  payment_date: string;
};

export function buildCreditCardExpenseReportRows(input: {
  selectedCardIds: ReadonlySet<string>;
  purchases: readonly CardPurchase[];
  installments: readonly CardInstallment[];
  payments: readonly CardPayment[];
}) {
  const purchases = new Map(input.purchases.filter((row) => row.status === "active").map((row) => [row.id, row]));
  const months = new Map<string, { competenceMinor: number; cashMinor: number }>();
  const add = (month: string, key: "competenceMinor" | "cashMinor", amount: number) => {
    const row = months.get(month) ?? { competenceMinor: 0, cashMinor: 0 };
    row[key] = coerceMinorUnits(row[key] + amount);
    months.set(month, row);
  };

  for (const installment of input.installments) {
    const purchase = purchases.get(installment.purchase_id);
    if (!purchase || !input.selectedCardIds.has(installment.credit_card_id) || installment.status === "cancelled") continue;
    const month = getCardReportCompetenceMonth(purchase.purchase_date, installment.installment_number).slice(0, 7);
    const signed = purchase.entry_kind === "purchase" ? 1 : -1;
    add(month, "competenceMinor", signed * coerceMinorUnits(installment.amount));
  }
  for (const payment of input.payments) {
    if (!input.selectedCardIds.has(payment.credit_card_id)) continue;
    add(payment.payment_date.slice(0, 7), "cashMinor", coerceMinorUnits(payment.amount_minor));
  }

  return [...months.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([month, totals]) => ({ month, ...totals }));
}
