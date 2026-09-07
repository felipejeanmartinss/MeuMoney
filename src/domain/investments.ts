import { z } from "zod";
import { FINANCIAL_CONTEXTS } from "./accounts";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { isValidIsoDate } from "./dates";
import { assertMinorUnits, parseMoneyInputToMinor } from "./money";
import type {
  InvestmentCashFlowType,
  InvestmentAccountEventType,
  InvestmentClass,
  InvestmentIncomeType,
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

export const INVESTMENT_ACCOUNT_EVENT_TYPES = [
  "contribution",
  "redemption",
  "interest_on_capital",
  "dividend",
  "bonus",
  "other",
] as const;

export const INVESTMENT_TRANSFER_DIRECTIONS = ["inflow", "outflow"] as const;

export const INVESTMENT_ACCOUNT_EVENT_LABELS: Record<
  InvestmentAccountEventType,
  string
> = {
  contribution: "Aplicação ou aporte",
  redemption: "Liquidação ou resgate",
  interest_on_capital: "Juros sobre capital",
  dividend: "Dividendos",
  bonus: "Bonificação em dinheiro",
  other: "Outro rendimento",
};

export const INVESTMENT_INCOME_TYPE_LABELS: Record<
  InvestmentIncomeType,
  string
> = {
  interest_on_capital: "Juros sobre capital",
  dividend: "Dividendos",
  bonus: "Bonificação em dinheiro",
  other: "Outro rendimento",
};

export function investmentEventTransactionType(
  eventType: InvestmentAccountEventType,
) {
  return eventType === "contribution" ? "expense" as const : "income" as const;
}

export function inferInvestmentTransferEvent(
  direction: (typeof INVESTMENT_TRANSFER_DIRECTIONS)[number],
  description: string,
): InvestmentAccountEventType {
  const normalized = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  if (/\b(dividendo|dividendos)\b/.test(normalized)) return "dividend";
  if (/\b(jcp|juros sobre capital)\b/.test(normalized)) {
    return "interest_on_capital";
  }
  if (/\b(bonus|bonificacao)\b/.test(normalized)) return "bonus";
  return direction === "inflow" ? "contribution" : "redemption";
}

const MAX_QUANTITY_INTEGER_DIGITS = 18;

export function normalizeInvestmentQuantity(input: string | number): string {
  const rawInput =
    typeof input === "number" && Number.isFinite(input)
      ? input.toFixed(12)
      : String(input);
  const compact = rawInput.trim().replace(/\s/g, "").replace(",", ".");
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

export function formatInvestmentQuantity(quantity: string | number): string {
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

export const investmentAccountEntryFormSchema = z
  .object({
    accountId: z.uuid("Selecione uma conta de investimento válida."),
    positionId: z.union([
      z.uuid("Selecione uma posição de investimento válida."),
      z.literal("new"),
    ]),
    eventType: z.enum(INVESTMENT_ACCOUNT_EVENT_TYPES, {
      error: "Selecione o tipo do movimento.",
    }),
    description: z
      .string()
      .trim()
      .min(1, "Informe a descrição.")
      .max(180, "Use até 180 caracteres."),
    amountMinor: positiveMoneyInput,
    quantity: optionalQuantityInput,
    transactionDate: pastOrTodayDate,
    notes: z
      .string()
      .trim()
      .max(1000, "Use até 1.000 caracteres.")
      .transform((value) => value || null),
    newInstitution: z.string().trim().max(120).optional().default(""),
    newInvestmentClass: z.enum(INVESTMENT_CLASSES).optional(),
    newInvestmentType: z.enum(INVESTMENT_TYPES).optional(),
    newAssetName: z.string().trim().max(160).optional().default(""),
  })
  .superRefine((value, context) => {
    if (value.positionId !== "new") return;
    if (value.eventType !== "contribution") {
      context.addIssue({
        code: "custom",
        path: ["positionId"],
        message: "Uma nova posição deve começar por uma aplicação ou aporte.",
      });
    }
    if (!value.newInstitution) {
      context.addIssue({
        code: "custom",
        path: ["newInstitution"],
        message: "Informe a instituição.",
      });
    }
    if (!value.newAssetName) {
      context.addIssue({
        code: "custom",
        path: ["newAssetName"],
        message: "Informe o ativo.",
      });
    }
    if (!value.newInvestmentClass || !value.newInvestmentType) {
      context.addIssue({
        code: "custom",
        path: ["newInvestmentType"],
        message: "Selecione a classe e o produto.",
      });
      return;
    }
    const validTypes = INVESTMENT_TYPES_BY_CLASS[value.newInvestmentClass];
    if (!(validTypes as readonly string[]).includes(value.newInvestmentType)) {
      context.addIssue({
        code: "custom",
        path: ["newInvestmentType"],
        message: "O produto não pertence à classe selecionada.",
      });
    }
  });

export const investmentTransferLinkFormSchema = z
  .object({
    accountId: z.uuid("Conta de investimento inválida."),
    transferEntryId: z.uuid("Transferência inválida."),
    positionId: z.union([
      z.uuid("Selecione uma posição de investimento válida."),
      z.literal("new"),
    ]),
    eventType: z.enum(INVESTMENT_ACCOUNT_EVENT_TYPES, {
      error: "Selecione o tipo do movimento.",
    }),
    quantity: optionalQuantityInput,
    notes: z
      .string()
      .trim()
      .max(1000, "Use até 1.000 caracteres.")
      .transform((value) => value || null),
    newInstitution: z.string().trim().max(120).optional().default(""),
    newInvestmentClass: z.enum(INVESTMENT_CLASSES).optional(),
    newInvestmentType: z.enum(INVESTMENT_TYPES).optional(),
    newAssetName: z.string().trim().max(160).optional().default(""),
  })
  .superRefine((value, context) => {
    if (value.positionId !== "new") return;
    if (value.eventType !== "contribution") {
      context.addIssue({
        code: "custom",
        path: ["positionId"],
        message: "Crie primeiro a posição anterior e depois vincule esta saída.",
      });
    }
    if (!value.newInstitution) {
      context.addIssue({
        code: "custom",
        path: ["newInstitution"],
        message: "Informe a instituição.",
      });
    }
    if (!value.newAssetName) {
      context.addIssue({
        code: "custom",
        path: ["newAssetName"],
        message: "Informe o ativo.",
      });
    }
    if (!value.newInvestmentClass || !value.newInvestmentType) {
      context.addIssue({
        code: "custom",
        path: ["newInvestmentType"],
        message: "Selecione a classe e o produto.",
      });
      return;
    }
    const validTypes = INVESTMENT_TYPES_BY_CLASS[value.newInvestmentClass];
    if (!(validTypes as readonly string[]).includes(value.newInvestmentType)) {
      context.addIssue({
        code: "custom",
        path: ["newInvestmentType"],
        message: "O produto não pertence à classe selecionada.",
      });
    }
  });

export const investmentPositionIdSchema = z.uuid(
  "Posição de investimento inválida.",
);

export const investmentCashFlowIdSchema = z.uuid(
  "Movimentação de investimento inválida.",
);

export const investmentPositionSnapshotIdSchema = z.uuid(
  "Atualização da posição inválida.",
);

export type InvestmentPositionMoneyEffect = {
  valueDeltaMinor: number;
  costDeltaMinor: number;
  nextCurrentValueMinor: number;
  nextAccumulatedCostMinor: number;
};

export function calculateInvestmentPositionMoneyEffect(input: {
  cashFlowType: InvestmentCashFlowType;
  amountMinor: number;
  currentValueMinor: number;
  accumulatedCostMinor: number;
}): InvestmentPositionMoneyEffect {
  const amount = assertMinorUnits(input.amountMinor);
  const currentValue = assertMinorUnits(input.currentValueMinor);
  const accumulatedCost = assertMinorUnits(input.accumulatedCostMinor);
  if (amount <= 0) throw new Error("Investment cash flows must be positive.");
  if (currentValue < 0 || accumulatedCost < 0) {
    throw new Error("Investment position values cannot be negative.");
  }

  let valueDeltaMinor = 0;
  let costDeltaMinor = 0;
  if (input.cashFlowType === "contribution") {
    valueDeltaMinor = amount;
    costDeltaMinor = amount;
  } else if (input.cashFlowType === "redemption") {
    if (amount > currentValue) {
      throw new Error("Investment redemption exceeds the current position.");
    }
    const redeemedCost =
      amount === currentValue
        ? accumulatedCost
        : currentValue === 0
          ? 0
          : Number(
              (BigInt(accumulatedCost) * BigInt(amount) +
                BigInt(Math.floor(currentValue / 2))) /
                BigInt(currentValue),
            );
    valueDeltaMinor = -amount;
    costDeltaMinor = -redeemedCost;
  }

  return {
    valueDeltaMinor,
    costDeltaMinor,
    nextCurrentValueMinor: assertMinorUnits(currentValue + valueDeltaMinor),
    nextAccumulatedCostMinor: assertMinorUnits(
      accumulatedCost + costDeltaMinor,
    ),
  };
}

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

export type InvestmentPerformancePosition = InvestmentAggregationPosition & {
  positionDate: string;
};

export type InvestmentPerformanceCashFlow = InvestmentAggregationCashFlow & {
  cashFlowDate: string;
};

export type InvestmentPerformanceSnapshot = {
  positionId: string;
  userId: string;
  currentValueMinor: number;
  positionDate: string;
};

export type InvestmentPeriodPerformance = {
  resultMinor: number;
  returnBasisMinor: number;
  returnBasisPoints: number;
};

export type InvestmentBreakdown = {
  contributionsMinor: number;
  redemptionsMinor: number;
  incomeMinor: number;
  unrealizedAppreciationMinor: number;
  totalResultMinor: number | null;
};

export type InvestmentPerformance = {
  resultMinor: number;
  resultIsEstimated: boolean;
  realizedGainLossMinor: number | null;
  returnBasisMinor: number;
  totalReturnBasisPoints: number | null;
  monthlyReturnBasisPoints: number | null;
  annualizedReturnBasisPoints: number | null;
};

type DatedPerformanceAmount = {
  date: string;
  amountMinor: number;
};

function calculateReturnBasisPoints(resultMinor: number, basisMinor: number) {
  if (basisMinor <= 0) return null;
  const result = assertMinorUnits(resultMinor);
  const basis = assertMinorUnits(basisMinor);
  const scaled = (BigInt(result) * 10_000n) / BigInt(basis);
  const value = Number(scaled);
  return Number.isSafeInteger(value) ? value : null;
}

function previousCalendarMonth(referenceDate: string) {
  if (!isValidIsoDate(referenceDate)) {
    throw new Error("Investment performance reference date must be valid.");
  }
  const [year, month] = referenceDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 2, 1));
  const end = new Date(Date.UTC(year, month - 1, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function calculatePreviousMonthInvestmentPerformance(
  position: Pick<InvestmentPerformancePosition, "id" | "userId">,
  cashFlows: readonly InvestmentPerformanceCashFlow[],
  snapshots: readonly InvestmentPerformanceSnapshot[],
  referenceDate: string,
): InvestmentPeriodPerformance | null {
  const { startDate, endDate } = previousCalendarMonth(referenceDate);
  const matchingSnapshots = snapshots.filter(
    (snapshot) =>
      snapshot.userId === position.userId &&
      snapshot.positionId === position.id,
  );
  const latestSnapshot = (
    candidates: readonly InvestmentPerformanceSnapshot[],
  ) =>
    candidates.reduce<InvestmentPerformanceSnapshot | null>(
      (latest, snapshot) =>
        !latest || snapshot.positionDate >= latest.positionDate
          ? snapshot
          : latest,
      null,
    );
  const openingSnapshot = latestSnapshot(
    matchingSnapshots.filter((snapshot) => snapshot.positionDate < startDate),
  );
  const closingSnapshot = latestSnapshot(
    matchingSnapshots.filter(
      (snapshot) =>
        snapshot.positionDate >= startDate && snapshot.positionDate <= endDate,
    ),
  );
  if (!openingSnapshot || !closingSnapshot) return null;

  let contributionsMinor = 0;
  let redemptionsMinor = 0;
  let incomeMinor = 0;
  for (const cashFlow of cashFlows) {
    if (
      cashFlow.userId !== position.userId ||
      cashFlow.positionId !== position.id ||
      cashFlow.cashFlowDate < startDate ||
      cashFlow.cashFlowDate > endDate
    ) {
      continue;
    }
    const amount = assertMinorUnits(cashFlow.amountMinor);
    if (amount <= 0) throw new Error("Investment cash flows must be positive.");
    if (cashFlow.type === "contribution") {
      contributionsMinor = assertMinorUnits(contributionsMinor + amount);
    } else if (cashFlow.type === "redemption") {
      redemptionsMinor = assertMinorUnits(redemptionsMinor + amount);
    } else {
      incomeMinor = assertMinorUnits(incomeMinor + amount);
    }
  }

  const openingValueMinor = assertMinorUnits(openingSnapshot.currentValueMinor);
  const closingValueMinor = assertMinorUnits(closingSnapshot.currentValueMinor);
  const resultMinor = assertMinorUnits(
    closingValueMinor +
      redemptionsMinor +
      incomeMinor -
      openingValueMinor -
      contributionsMinor,
  );
  const returnBasisMinor = assertMinorUnits(
    openingValueMinor + contributionsMinor,
  );
  const returnBasisPoints = calculateReturnBasisPoints(
    resultMinor,
    returnBasisMinor,
  );
  return returnBasisPoints === null
    ? null
    : { resultMinor, returnBasisMinor, returnBasisPoints };
}

export function summarizeInvestmentPeriodPerformance(
  performances: readonly (InvestmentPeriodPerformance | null)[],
): InvestmentPeriodPerformance | null {
  if (
    performances.length === 0 ||
    performances.some((performance) => performance === null)
  ) {
    return null;
  }
  const complete = performances as readonly InvestmentPeriodPerformance[];
  const resultMinor = complete.reduce(
    (total, performance) => assertMinorUnits(total + performance.resultMinor),
    0,
  );
  const returnBasisMinor = complete.reduce(
    (total, performance) =>
      assertMinorUnits(total + performance.returnBasisMinor),
    0,
  );
  const returnBasisPoints = calculateReturnBasisPoints(
    resultMinor,
    returnBasisMinor,
  );
  return returnBasisPoints === null
    ? null
    : { resultMinor, returnBasisMinor, returnBasisPoints };
}

function utcDay(date: string) {
  if (!isValidIsoDate(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function calculateAnnualizedReturnBasisPoints(
  datedAmounts: readonly DatedPerformanceAmount[],
) {
  const normalized = datedAmounts.flatMap((entry) => {
    const day = utcDay(entry.date);
    const amountMinor = assertMinorUnits(entry.amountMinor);
    return day === null || amountMinor === 0 ? [] : [{ day, amountMinor }];
  });
  if (normalized.length < 2) return null;
  if (
    !normalized.some((entry) => entry.amountMinor < 0) ||
    !normalized.some((entry) => entry.amountMinor > 0)
  ) {
    return null;
  }

  const firstDay = Math.min(...normalized.map((entry) => entry.day));
  const lastDay = Math.max(...normalized.map((entry) => entry.day));
  if (firstDay === lastDay) return null;

  const netPresentValue = (rate: number) =>
    normalized.reduce(
      (total, entry) =>
        total +
        entry.amountMinor /
          (1 + rate) ** ((entry.day - firstDay) / 365),
      0,
    );

  let lower = -0.9999;
  let upper = 1;
  let lowerValue = netPresentValue(lower);
  let upperValue = netPresentValue(upper);
  for (
    let attempt = 0;
    attempt < 32 && Math.sign(lowerValue) === Math.sign(upperValue);
    attempt += 1
  ) {
    upper = upper * 2 + 1;
    upperValue = netPresentValue(upper);
  }
  if (
    !Number.isFinite(lowerValue) ||
    !Number.isFinite(upperValue) ||
    Math.sign(lowerValue) === Math.sign(upperValue)
  ) {
    return null;
  }

  for (let iteration = 0; iteration < 120; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const midpointValue = netPresentValue(midpoint);
    if (!Number.isFinite(midpointValue)) return null;
    if (Math.abs(midpointValue) < 0.0001) {
      lower = midpoint;
      upper = midpoint;
      break;
    }
    if (Math.sign(midpointValue) === Math.sign(lowerValue)) {
      lower = midpoint;
      lowerValue = midpointValue;
    } else {
      upper = midpoint;
      upperValue = midpointValue;
    }
  }

  const basisPoints = Math.round(((lower + upper) / 2) * 10_000);
  return Number.isSafeInteger(basisPoints) ? basisPoints : null;
}

function calculateMonthlyEquivalentBasisPoints(
  annualizedReturnBasisPoints: number | null,
) {
  if (
    annualizedReturnBasisPoints === null ||
    annualizedReturnBasisPoints <= -10_000
  ) {
    return null;
  }
  const annualRate = annualizedReturnBasisPoints / 10_000;
  const monthlyBasisPoints = Math.round(
    ((1 + annualRate) ** (1 / 12) - 1) * 10_000,
  );
  return Number.isSafeInteger(monthlyBasisPoints)
    ? monthlyBasisPoints
    : null;
}

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

export function calculateInvestmentPerformance(
  position: InvestmentPerformancePosition,
  cashFlows: readonly InvestmentPerformanceCashFlow[],
): InvestmentPerformance {
  const matchingCashFlows = cashFlows.filter(
    (cashFlow) =>
      cashFlow.userId === position.userId &&
      cashFlow.positionId === position.id,
  );
  const breakdown = calculateInvestmentBreakdown(position, matchingCashFlows);
  const resultIsEstimated = !position.historyIsComplete;
  const resultMinor = resultIsEstimated
    ? breakdown.unrealizedAppreciationMinor
    : assertMinorUnits(breakdown.totalResultMinor ?? 0);
  const returnBasisMinor = assertMinorUnits(
    resultIsEstimated
      ? position.accumulatedCostMinor
      : breakdown.contributionsMinor,
  );
  const redeemedCostMinor = assertMinorUnits(
    breakdown.contributionsMinor - position.accumulatedCostMinor,
  );
  const realizedGainLossMinor =
    position.historyIsComplete && redeemedCostMinor >= 0
      ? assertMinorUnits(breakdown.redemptionsMinor - redeemedCostMinor)
      : null;
  const datedAmounts: DatedPerformanceAmount[] = matchingCashFlows.map(
    (cashFlow) => ({
      date: cashFlow.cashFlowDate,
      amountMinor:
        cashFlow.type === "contribution"
          ? -assertMinorUnits(cashFlow.amountMinor)
          : assertMinorUnits(cashFlow.amountMinor),
    }),
  );
  if (position.currentValueMinor > 0) {
    datedAmounts.push({
      date: position.positionDate,
      amountMinor: assertMinorUnits(position.currentValueMinor),
    });
  }
  const annualizedReturnBasisPoints = position.historyIsComplete
    ? calculateAnnualizedReturnBasisPoints(datedAmounts)
    : null;

  return {
    resultMinor,
    resultIsEstimated,
    realizedGainLossMinor,
    returnBasisMinor,
    totalReturnBasisPoints: calculateReturnBasisPoints(
      resultMinor,
      returnBasisMinor,
    ),
    monthlyReturnBasisPoints: calculateMonthlyEquivalentBasisPoints(
      annualizedReturnBasisPoints,
    ),
    annualizedReturnBasisPoints,
  };
}

export function summarizeInvestmentPerformance(
  positions: readonly InvestmentPerformancePosition[],
  cashFlows: readonly InvestmentPerformanceCashFlow[],
): InvestmentPerformance {
  const performances = positions.map((position) =>
    calculateInvestmentPerformance(position, cashFlows),
  );
  const resultMinor = performances.reduce(
    (total, performance) =>
      assertMinorUnits(total + performance.resultMinor),
    0,
  );
  const returnBasisMinor = performances.reduce(
    (total, performance) =>
      assertMinorUnits(total + performance.returnBasisMinor),
    0,
  );
  const complete = positions.every((position) => position.historyIsComplete);
  const realizedGainLossMinor = performances.every(
    (performance) => performance.realizedGainLossMinor !== null,
  )
    ? performances.reduce(
        (total, performance) =>
          assertMinorUnits(
            total + (performance.realizedGainLossMinor ?? 0),
          ),
        0,
      )
    : null;
  const positionIds = new Set(positions.map((position) => position.id));
  const userIds = new Set(positions.map((position) => position.userId));
  const datedAmounts: DatedPerformanceAmount[] = cashFlows.flatMap(
    (cashFlow) =>
      positionIds.has(cashFlow.positionId) && userIds.has(cashFlow.userId)
        ? [
            {
              date: cashFlow.cashFlowDate,
              amountMinor:
                cashFlow.type === "contribution"
                  ? -assertMinorUnits(cashFlow.amountMinor)
                  : assertMinorUnits(cashFlow.amountMinor),
            },
          ]
        : [],
  );
  for (const position of positions) {
    if (position.currentValueMinor <= 0) continue;
    datedAmounts.push({
      date: position.positionDate,
      amountMinor: assertMinorUnits(position.currentValueMinor),
    });
  }
  const annualizedReturnBasisPoints = complete
    ? calculateAnnualizedReturnBasisPoints(datedAmounts)
    : null;

  return {
    resultMinor,
    resultIsEstimated: !complete,
    realizedGainLossMinor,
    returnBasisMinor,
    totalReturnBasisPoints: calculateReturnBasisPoints(
      resultMinor,
      returnBasisMinor,
    ),
    monthlyReturnBasisPoints: calculateMonthlyEquivalentBasisPoints(
      annualizedReturnBasisPoints,
    ),
    annualizedReturnBasisPoints,
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
