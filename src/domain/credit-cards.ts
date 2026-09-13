import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { assertMinorUnits, parseMoneyInputToMinor } from "./money";
import type {
  CreditCardBrand,
  CreditCardInvoiceStatus,
} from "../types/database";

export const CREDIT_CARD_BRANDS = [
  "visa",
  "mastercard",
  "elo",
  "amex",
  "hipercard",
  "other",
] as const;

export const CREDIT_CARD_BRAND_LABELS: Record<CreditCardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "American Express",
  hipercard: "Hipercard",
  other: "Outra",
};

export const CREDIT_CARD_INVOICE_STATUS_LABELS: Record<
  CreditCardInvoiceStatus,
  string
> = {
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  overdue: "Vencida",
};

const moneyInput = (allowZero = false) =>
  z.string().trim().transform((value, context) => {
    try {
      const amount = parseMoneyInputToMinor(value);
      if (allowZero ? amount < 0 : amount <= 0) {
        context.addIssue({
          code: "custom",
          message: allowZero
            ? "O valor não pode ser negativo."
            : "Informe um valor maior que zero.",
        });
        return z.NEVER;
      }
      return amount;
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Informe um valor válido.",
      });
      return z.NEVER;
    }
  });

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum, `Use até ${maximum.toLocaleString("pt-BR")} caracteres.`)
    .transform((value) => value || null);

export const creditCardFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cartão.").max(80),
  issuer: z.string().trim().min(1, "Informe o emissor.").max(80),
  brand: z.enum(CREDIT_CARD_BRANDS, { error: "Selecione a bandeira." }),
  lastFourDigits: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Informe exatamente os quatro últimos dígitos."),
  creditLimit: moneyInput(true),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
  currency: z.enum(["BRL", "USD", "EUR"]),
  linkedAccountId: z.preprocess(
    (value) => (value === "" ? null : value),
    z.uuid("Selecione uma conta válida.").nullable(),
  ),
});

export const creditCardPurchaseFormSchema = z
  .object({
    categoryId: z.uuid("Selecione uma categoria válida."),
    description: z
      .string()
      .trim()
      .min(1, "Informe a descrição.")
      .max(180, "Use até 180 caracteres."),
    totalAmount: moneyInput(),
    purchaseDate: z
      .string()
      .refine(isValidIsoDate, "Informe uma data válida."),
    installmentCount: z.coerce.number().int().min(1).max(240),
    installmentAmounts: z
      .array(moneyInput())
      .min(1, "Informe o valor das parcelas.")
      .max(240),
    isRecurring: z.boolean(),
    notes: optionalText(1000),
  })
  .superRefine((data, context) => {
    if (
      data.isRecurring &&
      (data.installmentCount !== 1 || data.installmentAmounts.length !== 1)
    ) {
      context.addIssue({
        code: "custom",
        path: ["installmentCount"],
        message: "Assinaturas não possuem quantidade fixa de parcelas.",
      });
    }
    if (data.installmentCount > data.totalAmount) {
      context.addIssue({
        code: "custom",
        path: ["installmentCount"],
        message: "O número de parcelas não pode superar o total em centavos.",
      });
    }
    if (data.installmentAmounts.length !== data.installmentCount) {
      context.addIssue({
        code: "custom",
        path: ["installmentAmounts"],
        message: "Revise a quantidade de valores da prévia.",
      });
    }
    const distributionTotal = data.installmentAmounts.reduce(
      (sum, amount) => sum + amount,
      0,
    );
    if (!Number.isSafeInteger(distributionTotal) || distributionTotal !== data.totalAmount) {
      context.addIssue({
        code: "custom",
        path: ["installmentAmounts"],
        message: "A soma das parcelas deve ser igual ao valor total da compra.",
      });
    }
  });

export const creditCardInstallmentAmountFormSchema = z.object({
  amount: moneyInput(),
});

export const invoicePaymentFormSchema = z.object({
  accountId: z.uuid("Selecione uma conta válida."),
  paymentDate: z.string().refine(isValidIsoDate, "Informe uma data válida."),
  confirmation: z.literal("yes", {
    error: "Confirme que deseja registrar o pagamento.",
  }),
});

export const creditCardIdSchema = z.uuid("Cartão inválido.");
export const creditCardPurchaseIdSchema = z.uuid("Compra inválida.");
export const creditCardInvoiceIdSchema = z.uuid("Fatura inválida.");
export const creditCardInstallmentIdSchema = z.uuid("Parcela inválida.");

type DateParts = { year: number; month: number; day: number };

function parseIsoDate(value: string): DateParts {
  if (!isValidIsoDate(value)) {
    throw new Error("Data inválida.");
  }
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function formatDate({ year, month, day }: DateParts) {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function shiftMonth(year: number, month: number, offset: number) {
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
  };
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function boundedDayDate(year: number, month: number, day: number) {
  return formatDate({
    year,
    month,
    day: Math.min(day, daysInMonth(year, month)),
  });
}

export function getPurchaseReferenceMonth(
  purchaseDate: string,
  closingDay: number,
) {
  const purchase = parseIsoDate(purchaseDate);
  const offset = purchase.day <= closingDay ? 0 : 1;
  const reference = shiftMonth(purchase.year, purchase.month, offset);
  return boundedDayDate(reference.year, reference.month, 1);
}

export function getInvoiceDueDate(
  referenceMonth: string,
  closingDay: number,
  dueDay: number,
) {
  const reference = parseIsoDate(referenceMonth);
  const closingDate = boundedDayDate(
    reference.year,
    reference.month,
    closingDay,
  );
  const sameMonthDueDate = boundedDayDate(
    reference.year,
    reference.month,
    dueDay,
  );
  if (sameMonthDueDate > closingDate) return sameMonthDueDate;
  const nextMonth = shiftMonth(reference.year, reference.month, 1);
  return boundedDayDate(nextMonth.year, nextMonth.month, dueDay);
}

export function splitInstallments(
  totalAmountMinor: number,
  installmentCount: number,
  purchaseDate: string,
  closingDay: number,
) {
  if (
    !Number.isSafeInteger(totalAmountMinor) ||
    totalAmountMinor <= 0 ||
    !Number.isInteger(installmentCount) ||
    installmentCount < 1 ||
    installmentCount > 240 ||
    installmentCount > totalAmountMinor
  ) {
    throw new Error("Valor ou quantidade de parcelas inválidos.");
  }

  const firstReference = parseIsoDate(
    getPurchaseReferenceMonth(purchaseDate, closingDay),
  );
  const baseAmount = Math.floor(totalAmountMinor / installmentCount);

  return Array.from({ length: installmentCount }, (_, index) => {
    const reference = shiftMonth(firstReference.year, firstReference.month, index);
    return {
      installmentNumber: index + 1,
      installmentCount,
      amountMinor:
        index === installmentCount - 1
          ? totalAmountMinor - baseAmount * (installmentCount - 1)
          : baseAmount,
      competenceDate: boundedDayDate(reference.year, reference.month, 1),
    };
  });
}

export function effectiveInvoiceStatus(
  status: CreditCardInvoiceStatus,
  dueDate: string,
  today: string,
): CreditCardInvoiceStatus {
  return status === "closed" && dueDate < today ? "overdue" : status;
}

export type CreditCardInvoiceForecastRow = {
  referenceMonth: string;
  amountMinor: number;
  invoiceId: string | null;
  projected: boolean;
};

export type CreditCardCommitment = {
  lastInvoiceMonth: string | null;
  committedMinor: number;
  availableMinor: number;
};

/**
 * Consolida o limite comprometido somente ate a ultima fatura cadastrada.
 * Assinaturas ativas completam os meses ainda nao materializados, sem recriar
 * meses pagos ou cancelados que ja possuam uma parcela registrada.
 */
export function calculateCreditCardCommitment(input: {
  creditLimitMinor: number;
  invoices: readonly { referenceMonth: string }[];
  purchases: readonly {
    id: string;
    totalAmountMinor: number;
    purchaseDate: string;
    isRecurring: boolean;
  }[];
  installments: readonly {
    purchaseId: string;
    amountMinor: number;
    competenceDate: string;
    status: "pending" | "invoiced" | "paid" | "cancelled";
  }[];
  closingDay: number;
}): CreditCardCommitment {
  const creditLimitMinor = Math.max(0, assertMinorUnits(input.creditLimitMinor));
  const lastInvoiceMonth = input.invoices
    .map((invoice) => invoice.referenceMonth)
    .filter((referenceMonth) => /^\d{4}-\d{2}-01$/.test(referenceMonth))
    .sort()
    .at(-1) ?? null;

  if (!lastInvoiceMonth) {
    return {
      lastInvoiceMonth: null,
      committedMinor: 0,
      availableMinor: creditLimitMinor,
    };
  }

  const purchaseById = new Map(
    input.purchases.map((purchase) => [purchase.id, purchase]),
  );
  const registeredMonthsByPurchase = new Map<string, Set<string>>();
  let committedMinor = 0;

  for (const installment of input.installments) {
    if (!purchaseById.has(installment.purchaseId)) continue;
    if (installment.competenceDate > lastInvoiceMonth) continue;

    const months =
      registeredMonthsByPurchase.get(installment.purchaseId) ??
      new Set<string>();
    months.add(installment.competenceDate);
    registeredMonthsByPurchase.set(installment.purchaseId, months);
    if (installment.status === "pending" || installment.status === "invoiced") {
      committedMinor = assertMinorUnits(
        committedMinor + Math.max(0, assertMinorUnits(installment.amountMinor)),
      );
    }
  }

  for (const purchase of input.purchases) {
    if (!purchase.isRecurring) continue;
    const amountMinor = Math.max(0, assertMinorUnits(purchase.totalAmountMinor));
    const firstReference = parseIsoDate(
      getPurchaseReferenceMonth(purchase.purchaseDate, input.closingDay),
    );
    const registeredMonths = registeredMonthsByPurchase.get(purchase.id) ?? new Set<string>();

    for (let offset = 1; offset <= 240; offset += 1) {
      const month = shiftMonth(firstReference.year, firstReference.month, offset);
      const referenceMonth = boundedDayDate(month.year, month.month, 1);
      if (referenceMonth > lastInvoiceMonth) break;
      if (!registeredMonths.has(referenceMonth)) {
        committedMinor = assertMinorUnits(committedMinor + amountMinor);
      }
    }
  }

  return {
    lastInvoiceMonth,
    committedMinor,
    availableMinor: assertMinorUnits(creditLimitMinor - committedMinor),
  };
}

export function buildCreditCardInvoiceForecast(input: {
  referenceMonth: string;
  months?: number;
  invoices: readonly {
    id: string;
    referenceMonth: string;
    totalAmountMinor: number;
  }[];
  subscriptions: readonly {
    amountMinor: number;
    firstReferenceMonth: string;
  }[];
}): CreditCardInvoiceForecastRow[] {
  const months = input.months ?? 6;
  const start = parseIsoDate(input.referenceMonth);
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new Error("Quantidade de meses da projeção inválida.");
  }
  const invoiceByMonth = new Map(
    input.invoices.map((invoice) => [invoice.referenceMonth, invoice]),
  );

  return Array.from({ length: months }, (_, index) => {
    const shifted = shiftMonth(start.year, start.month, index);
    const referenceMonth = boundedDayDate(shifted.year, shifted.month, 1);
    const invoice = invoiceByMonth.get(referenceMonth);
    const recurringProjection = input.subscriptions.reduce(
      (total, subscription) =>
        referenceMonth > subscription.firstReferenceMonth
          ? total + subscription.amountMinor
          : total,
      0,
    );
    const amountMinor = assertMinorUnits(
      assertMinorUnits(invoice?.totalAmountMinor ?? 0) +
        assertMinorUnits(recurringProjection),
    );
    return {
      referenceMonth,
      amountMinor,
      invoiceId: invoice?.id ?? null,
      projected: !invoice || recurringProjection > 0,
    };
  });
}
