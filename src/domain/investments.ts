import { z } from "zod";
import { FINANCIAL_CONTEXTS } from "./accounts";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { isValidIsoDate } from "./dates";
import { assertMinorUnits, parseMoneyInputToMinor } from "./money";
import type {
  InvestmentCashFlowType,
  InvestmentClass,
  InvestmentType,
  SupportedCurrency,
} from "../types/database";

export const INVESTMENT_CLASSES = [
  "fixed_income",
  "stock",
  "fund",
  "etf",
  "real_estate_fund",
  "pension",
  "crypto",
] as const;

export const INVESTMENT_CLASS_LABELS: Record<InvestmentClass, string> = {
  fixed_income: "Renda fixa",
  stock: "Ação",
  fund: "Fundo",
  etf: "ETF",
  real_estate_fund: "Fundo imobiliário",
  pension: "Previdência",
  crypto: "Criptomoeda",
};

export const INVESTMENT_FAMILY_LABELS = {
  fixed_income: "Renda fixa",
  variable_income: "Renda variável",
  pension: "Previdência privada",
  alternatives: "Alternativos",
} as const;

export const INVESTMENT_TYPES = [
  "treasury",
  "cdb",
  "lci_lca",
  "debenture",
  "other_fixed_income",
  "stock",
  "fii",
  "etf",
  "variable_fund",
  "pension",
  "crypto",
] as const;

export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  treasury: "Tesouro Direto",
  cdb: "CDB",
  lci_lca: "LCI ou LCA",
  debenture: "Debênture",
  other_fixed_income: "Outra renda fixa",
  stock: "Ação",
  fii: "Fundo imobiliário (FII)",
  etf: "ETF",
  variable_fund: "Fundo de investimento",
  pension: "Previdência privada",
  crypto: "Criptomoeda",
};

export const INVESTMENT_TYPES_BY_CLASS: Record<
  InvestmentClass,
  readonly InvestmentType[]
> = {
  fixed_income: [
    "treasury",
    "cdb",
    "lci_lca",
    "debenture",
    "other_fixed_income",
  ],
  stock: ["stock"],
  fund: ["variable_fund"],
  etf: ["etf"],
  real_estate_fund: ["fii"],
  pension: ["pension"],
  crypto: ["crypto"],
};

export function getInvestmentFamily(investmentClass: InvestmentClass) {
  if (investmentClass === "fixed_income") return "fixed_income" as const;
  if (
    investmentClass === "stock" ||
    investmentClass === "fund" ||
    investmentClass === "etf" ||
    investmentClass === "real_estate_fund"
  ) {
    return "variable_income" as const;
  }
  if (investmentClass === "pension") return "pension" as const;
  return "alternatives" as const;
}

export const INVESTMENT_CASH_FLOW_TYPES = [
  "contribution",
  "redemption",
  "income",
] as const;

export const INVESTMENT_CASH_FLOW_LABELS: Record<
  InvestmentCashFlowType,
  string
> = {
  contribution: "Aporte",
  redemption: "Resgate",
  income: "Renda",
};

const MAX_QUANTITY_INTEGER_DIGITS = 18;

export function normalizeInvestmentQuantity(input: string): string {
  const compact = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!compact) throw new Error("Informe a quantidade.");
  if (compact.includes("e") || compact.includes("E")) {
    throw new Error("Não use notação científica na quantidade.");
  }

  const match = compact.match(/^(\d+)(?:\.(\d{1,12}))?$/);
  if (!match) {
    throw new Error("Informe uma quantidade válida com até 12 decimais.");
  }

  const integerPart = match[1].replace(/^0+(?=\d)/, "");
  const decimalPart = (match[2] ?? "").replace(/0+$/, "");
  if (integerPart.length > MAX_QUANTITY_INTEGER_DIGITS) {
    throw new Error("A quantidade informada é muito alta.");
  }

  return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
}

export function formatInvestmentQuantity(quantity: string): string {
  const normalized = normalizeInvestmentQuantity(quantity);
  const [integerPart, decimalPart] = normalized.split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimalPart ? `${grouped},${decimalPart}` : grouped;
}

const nonNegativeMoneyInput = z
  .string()
  .trim()
  .transform((value, context) => {
    try {
      return parseMoneyInputToMinor(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Informe um valor válido.",
      });
      return z.NEVER;
    }
  })
  .refine((value) => value >= 0, "Informe um valor igual ou maior que zero.");

const positiveMoneyInput = z
  .string()
  .trim()
  .transform((value, context) => {
    try {
      return parseMoneyInputToMinor(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Informe um valor válido.",
      });
      return z.NEVER;
    }
  })
  .refine((value) => value > 0, "Informe um valor maior que zero.");

const quantityInput = z
  .string()
  .trim()
  .transform((value, context) => {
    try {
      return normalizeInvestmentQuantity(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "Informe uma quantidade válida.",
      });
      return z.NEVER;
    }
  });

const optionalQuantityInput = z
  .string()
  .trim()
  .transform((value, context) => {
    if (!value) return null;
    try {
      const normalized = normalizeInvestmentQuantity(value);
      if (normalized === "0") {
        context.addIssue({
          code: "custom",
          message: "Quando informada, a quantidade deve ser maior que zero.",
        });
        return z.NEVER;
      }
      return normalized;
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "Informe uma quantidade válida.",
      });
      return z.NEVER;
    }
  });

const pastOrTodayDate = z
  .string()
  .refine(isValidIsoDate, "Informe uma data válida.")
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    "A data não pode estar no futuro.",
  );

export const investmentPositionFormSchema = z.object({
  id: z.string().optional(),
  institution: z
    .string()
    .trim()
    .min(1, "Informe a instituição.")
    .max(120, "Use até 120 caracteres."),
  investmentClass: z.enum(INVESTMENT_CLASSES, {
    error: "Selecione a classe.",
  }),
  investmentType: z.enum(INVESTMENT_TYPES, {
    error: "Selecione o tipo de investimento.",
  }),
  assetName: z
    .string()
    .trim()
    .min(1, "Informe o ativo.")
    .max(120, "Use até 120 caracteres."),
  currency: z.enum(SUPPORTED_CURRENCIES, {
    error: "Selecione a moeda.",
  }),
  quantity: quantityInput,
  accumulatedCostMinor: nonNegativeMoneyInput,
  currentValueMinor: nonNegativeMoneyInput,
  positionDate: pastOrTodayDate,
  context: z.enum(FINANCIAL_CONTEXTS, {
    error: "Selecione o contexto.",
  }),
  historyIsComplete: z.boolean(),
  notes: z
    .string()
    .trim()
    .max(1000, "Use até 1.000 caracteres.")
    .transform((value) => value || null),
}).superRefine((value, context) => {
  if (!INVESTMENT_TYPES_BY_CLASS[value.investmentClass].includes(
    value.investmentType,
  )) {
    context.addIssue({
      code: "custom",
      path: ["investmentType"],
      message: "O tipo não corresponde à classe de investimento selecionada.",
    });
  }
});

export const investmentCashFlowFormSchema = z.object({
  positionId: z.uuid("Posição de investimento inválida."),
  cashFlowType: z.enum(INVESTMENT_CASH_FLOW_TYPES, {
    error: "Selecione o tipo de histórico.",
  }),
  amountMinor: positiveMoneyInput,
  quantity: optionalQuantityInput,
  cashFlowDate: pastOrTodayDate,
  notes: z
    .string()
    .trim()
    .max(1000, "Use até 1.000 caracteres.")
    .transform((value) => value || null),
});

export const investmentPositionIdSchema = z.uuid(
  "Posição de investimento inválida.",
);

export type InvestmentAggregationPosition = {
  id: string;
  userId: string;
  currency: SupportedCurrency;
  accumulatedCostMinor: number;
  currentValueMinor: number;
  historyIsComplete: boolean;
  isActive: boolean;
};

export type InvestmentAggregationCashFlow = {
  positionId: string;
  userId: string;
  type: InvestmentCashFlowType;
  amountMinor: number;
};

export type InvestmentBreakdown = {
  contributionsMinor: number;
  redemptionsMinor: number;
  incomeMinor: number;
  unrealizedAppreciationMinor: number;
  totalResultMinor: number | null;
};

export function calculateInvestmentBreakdown(
  position: InvestmentAggregationPosition,
  cashFlows: readonly InvestmentAggregationCashFlow[],
): InvestmentBreakdown {
  const totals = {
    contributionsMinor: 0,
    redemptionsMinor: 0,
    incomeMinor: 0,
  };

  for (const cashFlow of cashFlows) {
    if (
      cashFlow.userId !== position.userId ||
      cashFlow.positionId !== position.id
    ) {
      continue;
    }

    const amount = assertMinorUnits(cashFlow.amountMinor);
    if (amount <= 0) throw new Error("Investment cash flows must be positive.");

    if (cashFlow.type === "contribution") {
      totals.contributionsMinor = assertMinorUnits(
        totals.contributionsMinor + amount,
      );
    } else if (cashFlow.type === "redemption") {
      totals.redemptionsMinor = assertMinorUnits(
        totals.redemptionsMinor + amount,
      );
    } else {
      totals.incomeMinor = assertMinorUnits(totals.incomeMinor + amount);
    }
  }

  const currentValue = assertMinorUnits(position.currentValueMinor);
  const accumulatedCost = assertMinorUnits(position.accumulatedCostMinor);
  const unrealizedAppreciationMinor = assertMinorUnits(
    currentValue - accumulatedCost,
  );
  const totalResultMinor = position.historyIsComplete
    ? assertMinorUnits(
        currentValue +
          totals.redemptionsMinor +
          totals.incomeMinor -
          totals.contributionsMinor,
      )
    : null;

  return {
    ...totals,
    unrealizedAppreciationMinor,
    totalResultMinor,
  };
}

export function summarizeInvestmentsByCurrency(
  positions: readonly InvestmentAggregationPosition[],
  currentUserId: string,
) {
  const totals = new Map<SupportedCurrency, number>();

  for (const position of positions) {
    if (!position.isActive || position.userId !== currentUserId) continue;
    const currentValue = assertMinorUnits(position.currentValueMinor);
    if (currentValue < 0) {
      throw new Error("Investment values cannot be negative.");
    }
    totals.set(
      position.currency,
      assertMinorUnits((totals.get(position.currency) ?? 0) + currentValue),
    );
  }

  return SUPPORTED_CURRENCIES.flatMap((currency) => {
    const currentValueMinor = totals.get(currency);
    return currentValueMinor === undefined
      ? []
      : [{ currency, currentValueMinor }];
  });
}
