import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { parseMoneyInputToMinor } from "./money";
import type {
  RecurrenceFrequency,
  RecurringTransactionState,
} from "@/types/database";

export const RECURRENCE_FREQUENCIES = [
  "weekly",
  "monthly",
  "yearly",
] as const;

export const RECURRENCE_FREQUENCY_LABELS: Record<
  RecurrenceFrequency,
  string
> = {
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

export const RECURRENCE_STATE_LABELS: Record<
  RecurringTransactionState,
  string
> = {
  active: "Ativa",
  suspended: "Suspensa",
  ended: "Encerrada",
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

const optionalText = z
  .string()
  .trim()
  .max(1000, "Use até 1.000 caracteres.")
  .transform((value) => value || null);

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isValidIsoDate(value), {
    message: "Informe uma data válida.",
  })
  .transform((value) => value || null);

export const recurringTransactionFormSchema = z
  .object({
    accountId: z.uuid("Selecione uma conta válida."),
    categoryId: z.uuid("Selecione uma categoria válida."),
    transactionType: z.enum(["income", "expense"], {
      error: "Selecione receita ou despesa.",
    }),
    description: z
      .string()
      .trim()
      .min(1, "Informe a descrição.")
      .max(180, "Use até 180 caracteres."),
    amountMinor: positiveMoneyInput,
    frequency: z.enum(RECURRENCE_FREQUENCIES, {
      error: "Selecione a frequência.",
    }),
    startDate: z
      .string()
      .refine(isValidIsoDate, "Informe uma data inicial válida."),
    endDate: optionalDate,
    nextOccurrence: z
      .string()
      .refine(isValidIsoDate, "Informe a próxima ocorrência."),
    notes: optionalText,
  })
  .superRefine((value, context) => {
    if (value.nextOccurrence < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["nextOccurrence"],
        message: "A próxima ocorrência não pode anteceder a data inicial.",
      });
    }
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A data final não pode anteceder a data inicial.",
      });
    }
    if (value.endDate && value.nextOccurrence > value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["nextOccurrence"],
        message: "A próxima ocorrência deve estar dentro do período.",
      });
    }
  });

export const recurringTransactionIdSchema = z.uuid(
  "Recorrência inválida.",
);

export const recurringTransactionStateSchema = z.enum([
  "active",
  "suspended",
  "ended",
]);

export const recurringGenerationDateSchema = z
  .string()
  .refine(isValidIsoDate, "Informe uma data limite válida.");

function parseIsoDate(value: string) {
  if (!isValidIsoDate(value)) throw new Error("Invalid ISO date.");
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function toIsoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function nextRecurrenceDate({
  startDate,
  currentOccurrence,
  frequency,
}: {
  startDate: string;
  currentOccurrence: string;
  frequency: RecurrenceFrequency;
}) {
  const anchor = parseIsoDate(startDate);
  const current = parseIsoDate(currentOccurrence);

  if (currentOccurrence < startDate) {
    throw new Error("Current occurrence cannot precede start date.");
  }

  if (frequency === "weekly") {
    const date = new Date(
      Date.UTC(current.year, current.month - 1, current.day + 7),
    );
    return toIsoDate(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }

  if (frequency === "monthly") {
    const monthIndex = current.month;
    const year = current.year + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return toIsoDate(
      year,
      month,
      Math.min(anchor.day, daysInMonth(year, month)),
    );
  }

  const year = current.year + 1;
  return toIsoDate(
    year,
    anchor.month,
    Math.min(anchor.day, daysInMonth(year, anchor.month)),
  );
}

export function collectDueRecurrenceDates({
  startDate,
  nextOccurrence,
  endDate,
  frequency,
  targetDate,
  existingDates = new Set<string>(),
}: {
  startDate: string;
  nextOccurrence: string;
  endDate: string | null;
  frequency: RecurrenceFrequency;
  targetDate: string;
  existingDates?: ReadonlySet<string>;
}) {
  parseIsoDate(targetDate);
  let occurrence = nextOccurrence;
  const dueDates: string[] = [];
  let iterations = 0;

  while (
    occurrence <= targetDate &&
    (endDate === null || occurrence <= endDate)
  ) {
    iterations += 1;
    if (iterations > 10000) {
      throw new Error("Recurrence generation limit exceeded.");
    }
    if (!existingDates.has(occurrence)) dueDates.push(occurrence);
    occurrence = nextRecurrenceDate({
      startDate,
      currentOccurrence: occurrence,
      frequency,
    });
  }

  return {
    dueDates,
    nextOccurrence: occurrence,
    ended: endDate !== null && occurrence > endDate,
  };
}
