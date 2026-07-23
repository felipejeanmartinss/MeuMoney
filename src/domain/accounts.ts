import { z } from "zod";
import { parseMoneyInputToMinor } from "./money";
import { SUPPORTED_CURRENCIES } from "./currencies";
import type { AccountType, FinancialContext } from "../types/database";

export const EDITABLE_ACCOUNT_TYPES = ["checking", "savings", "cash", "other"] as const;
export const FINANCIAL_CONTEXTS = ["personal", "professional"] as const;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  other: "Outra conta",
  investment: "Investimentos",
  credit_card: "Cartão de crédito",
};

export const CONTEXT_LABELS: Record<FinancialContext, string> = {
  personal: "Pessoal",
  professional: "Profissional",
};

function isValidReferenceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const moneyInput = z.string().trim().transform((value, context) => {
  try {
    return parseMoneyInputToMinor(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Informe um valor válido.",
    });
    return z.NEVER;
  }
});

export const accountFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Informe o nome da conta.").max(80, "Use até 80 caracteres."),
  type: z.enum(EDITABLE_ACCOUNT_TYPES, { error: "Selecione um tipo de conta." }),
  context: z.enum(FINANCIAL_CONTEXTS, { error: "Selecione o contexto." }),
  currency: z.enum(SUPPORTED_CURRENCIES, { error: "Selecione uma moeda." }),
  openingBalanceMinor: moneyInput,
  openingBalanceDate: z
    .string()
    .refine(isValidReferenceDate, "Informe uma data de referência válida."),
});

export const accountIdSchema = z.uuid("Conta inválida.");
