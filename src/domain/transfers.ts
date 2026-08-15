import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { parseMoneyInputToMinor } from "./money";
import { TRANSACTION_STATUSES } from "./transactions";
import type { SupportedCurrency } from "../types/database";

export type TransferDestinationTarget =
  | { kind: "account"; id: string }
  | { kind: "credit_card"; id: string };

export type CreditCardTransferDestination = {
  id: string;
  cardName: string;
  currency: SupportedCurrency;
  currentBalanceMinor: number;
};

export function accountTransferDestinationValue(accountId: string) {
  return `account:${accountId}`;
}

export function creditCardTransferDestinationValue(creditCardId: string) {
  return `credit-card:${creditCardId}`;
}

export function parseTransferDestinationTarget(
  value: unknown,
): TransferDestinationTarget | null {
  if (typeof value !== "string") return null;
  const separatorIndex = value.indexOf(":");
  if (separatorIndex < 1) return null;

  const kind = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if (!z.uuid().safeParse(id).success) return null;

  if (kind === "account") return { kind: "account", id };
  if (kind === "credit-card") {
    return { kind: "credit_card", id };
  }
  return null;
}

const positiveMoneyInput = z.string().trim().transform((value, context) => {
  try {
    const amount = parseMoneyInputToMinor(value);
    if (amount <= 0) {
      context.addIssue({
        code: "custom",
        message: "Informe um valor maior que zero.",
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

export const transferFormSchema = z
  .object({
    sourceAccountId: z.uuid("Selecione a conta de origem."),
    destinationAccountId: z.uuid("Selecione a conta de destino."),
    amountMinor: positiveMoneyInput,
    transactionDate: z
      .string()
      .refine(isValidIsoDate, "Informe uma data válida."),
    status: z.enum(TRANSACTION_STATUSES, {
      error: "Selecione o status.",
    }),
    description: z
      .string()
      .trim()
      .max(180, "Use até 180 caracteres.")
      .transform((value) => value || null),
    notes: z
      .string()
      .trim()
      .max(1000, "Use até 1.000 caracteres.")
      .transform((value) => value || null),
  })
  .refine(
    (value) => value.sourceAccountId !== value.destinationAccountId,
    {
      message: "Origem e destino devem ser diferentes.",
      path: ["destinationAccountId"],
    },
  );

export const creditCardTransferFormSchema = z.object({
  sourceAccountId: z.uuid("Selecione a conta de origem."),
  destinationCreditCardId: z.uuid("Selecione o cartão de destino."),
  amountMinor: positiveMoneyInput,
  transactionDate: z
    .string()
    .refine(isValidIsoDate, "Informe uma data válida."),
  status: z.enum(TRANSACTION_STATUSES, {
    error: "Selecione o status.",
  }),
  description: z
    .string()
    .trim()
    .max(180, "Use até 180 caracteres.")
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(1000, "Use até 1.000 caracteres.")
    .transform((value) => value || null),
});

export const transferIdSchema = z.uuid("Transferência inválida.");

const optionalStatus = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.enum(TRANSACTION_STATUSES).optional(),
);

const optionalUuid = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.uuid().optional(),
);

const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().refine(isValidIsoDate).optional(),
);

export const transferFiltersSchema = z.object({
  status: optionalStatus,
  accountId: optionalUuid,
  dateFrom: optionalDate,
  dateTo: optionalDate,
  activity: z
    .enum(["active", "inactive", "all"])
    .catch("active")
    .default("active"),
});
