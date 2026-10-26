import { getCardReportCompetenceMonth } from "./credit-cards";
import { coerceMinorUnits } from "./money";

type CardPurchase = {
  id: string;
  description?: string;
  entry_kind: "purchase" | "refund" | "cashback";
  purchase_date: string;
  status: "active" | "cancelled";
};

type CardInstallment = {
  id?: string;
  purchase_id: string;
  credit_card_id: string;
  invoice_id?: string;
  installment_number: number;
  amount: number;
  status: string;
};

type CardPayment = {
  id?: string;
  credit_card_id: string;
  invoice_id?: string;
  amount_minor: number;
  payment_date: string;
};

type CardReportInput = {
  selectedCardIds: ReadonlySet<string>;
  purchases: readonly CardPurchase[];
  installments: readonly CardInstallment[];
  payments: readonly CardPayment[];
};

export function buildCreditCardExpenseReportData(input: CardReportInput) {
  const purchases = new Map(input.purchases.filter((row) => row.status === "active").map((row) => [row.id, row]));
  const months = new Map<string, { competenceMinor: number; cashMinor: number }>();
  const competenceEntries: Array<{ id: string; month: string; date: string; creditCardId: string; invoiceId: string | null; purchaseId: string; description: string; installmentNumber: number; amountMinor: number }> = [];
  const invoicePurchases = new Map<string, Array<{ id: string; date: string; description: string; installmentNumber: number; amountMinor: number }>>();
  const cashEntries: Array<{ id: string; month: string; date: string; creditCardId: string; invoiceId: string | null; amountMinor: number }> = [];
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
    const amountMinor = signed * coerceMinorUnits(installment.amount);
    add(month, "competenceMinor", amountMinor);
    const item = { id: installment.id ?? `${installment.purchase_id}:${installment.installment_number}`, date: purchase.purchase_date, description: purchase.description ?? "Compra no cartão", installmentNumber: installment.installment_number, amountMinor };
    competenceEntries.push({ ...item, month, creditCardId: installment.credit_card_id, invoiceId: installment.invoice_id ?? null, purchaseId: installment.purchase_id });
    if (installment.invoice_id) {
      const related = invoicePurchases.get(installment.invoice_id) ?? [];
      related.push(item);
      invoicePurchases.set(installment.invoice_id, related);
    }
  }
  for (const payment of input.payments) {
    if (!input.selectedCardIds.has(payment.credit_card_id)) continue;
    const month = payment.payment_date.slice(0, 7);
    const amountMinor = coerceMinorUnits(payment.amount_minor);
    add(month, "cashMinor", amountMinor);
    cashEntries.push({ id: payment.id ?? `${payment.credit_card_id}:${payment.payment_date}:${cashEntries.length}`, month, date: payment.payment_date, creditCardId: payment.credit_card_id, invoiceId: payment.invoice_id ?? null, amountMinor });
  }

  const rows = [...months.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([month, totals]) => ({ month, ...totals }));
  return { rows, competenceEntries, cashEntries, invoicePurchases };
}

export function buildCreditCardExpenseReportRows(input: CardReportInput) {
  return buildCreditCardExpenseReportData(input).rows;
}
