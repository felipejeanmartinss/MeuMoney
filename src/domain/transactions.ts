import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { parseMoneyInputToMinor } from "./money";
import type {
  TransactionStatus,
  TransactionType,
} from "../types/database";

export const TRANSACTION_TYPES = ["income", "expense"] as const;
export const TRANSACTION_STATUSES = ["pending", "completed"] as const;

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Receita",
  expense: "Despesa",
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  pending: "Previsto",
  completed: "Realizado",
};

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

const optionalText = (maximum: number, message: string) =>
  z
    .string()
    .trim()
    .max(maximum, message)
    .transform((value) => value || null);

export const transactionFormSchema = z.object({
  accountId: z.uuid("Selecione uma conta válida."),
  categoryId: z.uuid("Selecione uma categoria válida."),
  transactionType: z.enum(TRANSACTION_TYPES, {
    error: "Selecione receita ou despesa.",
  }),
  description: z
    .string()
    .trim()
    .min(1, "Informe a descrição.")
    .max(180, "Use até 180 caracteres."),
  amountMinor: positiveMoneyInput,
  transactionDate: z
    .string()
    .refine(isValidIsoDate, "Informe uma data válida."),
  status: z.enum(TRANSACTION_STATUSES, {
    error: "Selecione o status.",
  }),
  notes: optionalText(1000, "Use até 1.000 caracteres."),
});

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(values).optional(),
  );

const optionalUuid = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.uuid().optional(),
);

const optionalDate = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().refine(isValidIsoDate).optional(),
);

export const transactionFiltersSchema = z.object({
  transactionType: optionalEnum(TRANSACTION_TYPES),
  status: optionalEnum(TRANSACTION_STATUSES),
  accountId: optionalUuid,
  categoryId: optionalUuid,
  dateFrom: optionalDate,
  dateTo: optionalDate,
  activity: z
    .enum(["active", "inactive", "all"])
    .catch("active")
    .default("active"),
});

export const transactionIdSchema = z.uuid("Lançamento inválido.");
