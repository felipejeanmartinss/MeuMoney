import { z } from "zod";
import { parseImportAmountToMinor, parseImportDate } from "./file-imports";
import { isValidIsoDate } from "./dates";
import { parseMoneyInputToMinor } from "./money";
import { SUPPORTED_CURRENCIES } from "./currencies";
import type { PdfTextDocument, PdfTextPage } from "./pdf-imports";

export const FINANCING_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;

export type FinancingPaymentStatus = "paid" | "scheduled";
export type FinancingReductionType = "term" | "payment";
export type FinancingProductType = "financing" | "loan";

export type ParsedFinancingContract = {
  institution: string;
  contractReference: string;
  currency: "BRL";
  amortizationSystem: string | null;
  indexer: string | null;
  originalPrincipalMinor: number;
  originalTermMonths: number | null;
  contractDate: string;
  releaseDate: string | null;
  currentBalanceMinor: number;
  balanceDate: string;
  nominalAnnualRate: string | null;
  effectiveAnnualRate: string | null;
  cetAnnualRate: string | null;
  ceshAnnualRate: string | null;
  sourcePageCount: number;
};

export type ParsedFinancingScheduleEntry = {
  source_sequence: number;
  installment_number: number;
  due_date: string;
  total_amount_minor: number;
  principal_minor: number;
  interest_minor: number;
  correction_factor: string | null;
  insurance_mip_minor: number;
  insurance_dfi_minor: number;
  service_fee_minor: number;
  penalty_minor: number;
  late_interest_minor: number;
  fgts_minor: number;
  balance_correction_factor: string | null;
  outstanding_balance_minor: number;
  payment_status: FinancingPaymentStatus;
  payment_date: string | null;
  paid_amount_minor: number;
  source_pages: number[];
};

export type ParsedFinancingExtraAmortization = {
  source_sequence: number;
  event_date: string;
  reduction_type: FinancingReductionType;
  cash_amount_minor: number;
  fgts_amount_minor: number;
  installments_reduced: number | null;
  source_pages: number[];
};

export type ParsedFinancingDocument = {
  adapter: FinancingPdfAdapterInfo;
  contract: ParsedFinancingContract;
  schedule: ParsedFinancingScheduleEntry[];
  extraAmortizations: ParsedFinancingExtraAmortization[];
};

export type FinancingPdfAdapterInfo = {
  id: string;
  bankName: string;
  documentType: "financing_statement";
  layoutVersion: string;
};

export interface FinancingPdfAdapter {
  readonly info: FinancingPdfAdapterInfo;
  detect(document: PdfTextDocument): number;
  parse(document: PdfTextDocument): ParsedFinancingDocument;
}

export class FinancingImportError extends Error {
  constructor(
    public readonly code: "unsupported_layout" | "invalid_data",
    message: string,
  ) {
    super(message);
    this.name = "FinancingImportError";
  }
}

const BRADESCO_FINANCING_ADAPTER: FinancingPdfAdapterInfo = {
  id: "bradesco-financing-statement-v1",
  bankName: "Bradesco",
  documentType: "financing_statement",
  layoutVersion: "1",
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function allLines(document: PdfTextDocument) {
  return document.pages.flatMap((page) =>
    financingPageLines(page).map((text) => ({
      text: text.trim(),
      page: page.pageNumber,
    })),
  );
}

function transposedPositionedLines(page: PdfTextPage) {
  const items = page.positionedLines?.flatMap((line) => line.items) ?? [];
  const rows: Array<{ axis: number; items: typeof items }> = [];

  for (const item of [...items].sort(
    (left, right) => left.x - right.x || left.y - right.y,
  )) {
    const row = rows.find((candidate) => Math.abs(candidate.axis - item.x) <= 2);
    if (row) {
      row.items.push(item);
    } else {
      rows.push({ axis: item.x, items: [item] });
    }
  }

  return rows
    .sort((left, right) => left.axis - right.axis)
    .map((row) =>
      row.items
        .sort((left, right) => left.y - right.y)
        .map((item) => item.text.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function financingLayoutScore(lines: string[]) {
  const text = normalized(lines.join("\n"));
  const markers = [
    "DATA DO CONTRATO",
    "VALOR FINANCIAMENTO",
    "SISTEMA AMORTIZACAO",
    "SALDO DEVEDOR",
  ];
  const markerScore = markers.filter((marker) => text.includes(marker)).length;
  const structuredLines = lines.filter(
    (line) =>
      (/DATA DO CONTRATO/i.test(normalized(line)) &&
        /\d{2}\/\d{2}\/\d{4}/.test(line)) ||
      (/VALOR FINANCIAMENTO/i.test(normalized(line)) &&
        moneyValues(line).length > 0) ||
      /^\d+\s+\d{2}\/\d{2}\/\d{4}\s+/.test(line),
  ).length;
  return markerScore * 10 + structuredLines;
}

function financingPageLines(page: PdfTextPage) {
  const transposed = transposedPositionedLines(page);
  return financingLayoutScore(transposed) > financingLayoutScore(page.lines)
    ? transposed
    : page.lines;
}

function parseMoney(value: string) {
  return parseImportAmountToMinor(value, ",");
}

function parseFactor(value: string | undefined) {
  if (!value) return null;
  const result = value.replace(/\./g, "").replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(result) ? result : null;
}

function parseRate(value: string | undefined) {
  if (!value) return null;
  const result = value.replace("%", "").replace(/\./g, "").replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(result) ? result : null;
}

function requiredDate(value: string | undefined, label: string) {
  const parsed = value ? parseImportDate(value, "DD/MM/YYYY") : null;
  if (!parsed) {
    throw new FinancingImportError(
      "invalid_data",
      `O extrato não informou ${label} em um formato reconhecido.`,
    );
  }
  return parsed;
}

function moneyValues(value: string) {
  const withoutPercentages = value.replace(/\d+(?:[.,]\d+)?%/g, "");
  return (
    withoutPercentages.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g) ?? []
  );
}

function percentageValues(value: string) {
  return value.match(/\d+(?:[.,]\d+)?%/g) ?? [];
}

function findFollowingLine(
  lines: Array<{ text: string; page: number }>,
  marker: string,
) {
  const index = lines.findIndex((line) => normalized(line.text).includes(marker));
  return index >= 0 ? lines[index + 1]?.text : undefined;
}

function findNearbyLine(
  lines: Array<{ text: string; page: number }>,
  marker: string,
  predicate: (line: string) => boolean,
  distance = 4,
) {
  const index = lines.findIndex((line) => normalized(line.text).includes(marker));
  if (index < 0) return undefined;
  return lines
    .slice(index, index + distance + 1)
    .find((line) => predicate(line.text))?.text;
}

function findMoneyNearMarker(
  lines: Array<{ text: string; page: number }>,
  marker: string,
) {
  const index = lines.findIndex((line) => normalized(line.text).includes(marker));
  if (index < 0) return undefined;

  const markerValues = moneyValues(lines[index].text);
  if (markerValues.length > 0) return markerValues.at(-1);

  const nearbyText = lines
    .slice(index + 1, index + 3)
    .map((line) => line.text)
    .join(" ");
  return moneyValues(nearbyText).at(-1);
}

function parseBradescoHeader(
  document: PdfTextDocument,
): ParsedFinancingContract {
  const lines = allLines(document);
  const firstPageLines = lines.filter((line) => line.page === 1);
  const contractLine = firstPageLines.find(
    (line) =>
      normalized(line.text).includes("CONTRATO") &&
      !normalized(line.text).includes("DATA DO CONTRATO"),
  )?.text;
  const contractReference = contractLine?.match(/CONTRATO\s+([^\s]+)/i)?.[1];
  const contractDateLine = firstPageLines.find((line) =>
    normalized(line.text).includes("DATA DO CONTRATO"),
  )?.text;
  const contractDate = contractDateLine?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0];

  const currentBalanceText = findMoneyNearMarker(
    firstPageLines,
    "DADOS FINANCEIROS TAXAS SALDO DEVEDOR",
  );

  const financingLabelsLine = findFollowingLine(
    firstPageLines,
    "NOME VALOR FINANCIAMENTO INDEXADOR",
  );
  const financingDataLine = findNearbyLine(
    firstPageLines,
    "VALOR FINANCIAMENTO",
    (line) => moneyValues(line).length > 0 && percentageValues(line).length > 0,
  ) ?? financingLabelsLine;
  const originalPrincipalText = financingDataLine
    ? moneyValues(financingDataLine)[0]
    : undefined;
  const nominalRates = financingDataLine
    ? percentageValues(financingDataLine)
    : [];
  const indexer = financingDataLine
    ?.match(/\d{1,3}(?:\.\d{3})*,\d{2}\s+([A-Z0-9-]+)/i)?.[1]
    ?.toUpperCase();

  const amortizationLine = findNearbyLine(
    firstPageLines,
    "SISTEMA AMORTIZACAO",
    (line) => /\b(SAC|PRICE|SACRE)\b/i.test(normalized(line)),
  );
  const amortizationSystem = amortizationLine
    ?.match(/\b(SAC|PRICE|SACRE)\b/i)?.[1]
    ?.toUpperCase();
  const amortizationRates = amortizationLine
    ? percentageValues(amortizationLine)
    : [];
  const releaseDate = amortizationLine?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0];

  const termLine = firstPageLines.find((line) =>
    normalized(line.text).includes("PRAZO"),
  )?.text;
  const originalTermMonths = termLine
    ? Number(termLine.match(/\d+\s*\/\s*(\d+)/)?.[1])
    : null;

  const effectiveLine = firstPageLines.find((line) => {
    const rates = percentageValues(line.text);
    return (
      rates.length >= 2 &&
      /\d{2}\/\d{2}\/\d{4}/.test(line.text) &&
      normalized(line.text) !== normalized(amortizationLine ?? "")
    );
  })?.text;
  const effectiveRates = effectiveLine ? percentageValues(effectiveLine) : [];
  const balanceDate = effectiveLine
    ?.match(/\d{2}\/\d{2}\/\d{4}/g)
    ?.at(-1);

  if (
    !contractReference ||
    !contractDate ||
    !currentBalanceText ||
    !originalPrincipalText ||
    !balanceDate
  ) {
    throw new FinancingImportError(
      "invalid_data",
      "O cabeçalho financeiro do Bradesco está incompleto ou mudou de layout.",
    );
  }

  return {
    institution: "Bradesco",
    contractReference,
    currency: "BRL",
    amortizationSystem: amortizationSystem ?? null,
    indexer: indexer ?? null,
    originalPrincipalMinor: parseMoney(originalPrincipalText),
    originalTermMonths:
      originalTermMonths !== null &&
      Number.isSafeInteger(originalTermMonths) &&
      originalTermMonths > 0
        ? originalTermMonths
        : null,
    contractDate: requiredDate(contractDate, "a data do contrato"),
    releaseDate: releaseDate
      ? requiredDate(releaseDate, "a data de liberação")
      : null,
    currentBalanceMinor: parseMoney(currentBalanceText),
    balanceDate: requiredDate(balanceDate, "a data-base do saldo"),
    nominalAnnualRate: parseRate(nominalRates[0]),
    effectiveAnnualRate: parseRate(effectiveRates[0]),
    cetAnnualRate: parseRate(amortizationRates[0]),
    ceshAnnualRate: parseRate(amortizationRates[1]),
    sourcePageCount: document.pageCount,
  };
}

function parseBradescoRows(document: PdfTextDocument) {
  const schedule: ParsedFinancingScheduleEntry[] = [];
  const extraAmortizations: ParsedFinancingExtraAmortization[] = [];
  let scheduleSequence = 0;
  let extraSequence = 0;

  for (const page of document.pages) {
    let reductionType: FinancingReductionType | null = null;

    for (const rawLine of financingPageLines(page)) {
      const line = rawLine.replace(/\s+/g, " ").trim();
      const normalizedLine = normalized(line);

      if (normalizedLine.includes("AMORTIZACAO REDUCAO QTDE PRESTACOES")) {
        reductionType = "term";
        continue;
      }
      if (normalizedLine.includes("AMORTIZACAO REDUCAO VALOR PRESTACAO")) {
        reductionType = "payment";
        continue;
      }
      if (normalizedLine === "ENCARGOS") {
        reductionType = null;
        continue;
      }

      if (reductionType) {
        const event = line.match(
          /^(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d[\d.]*,\d{2})\s+(\d[\d.]*,\d{2})(?:\s+(\d+))?$/,
        );
        if (event) {
          extraSequence += 1;
          extraAmortizations.push({
            source_sequence: extraSequence,
            event_date: requiredDate(event[2], "a data da amortização"),
            reduction_type: reductionType,
            cash_amount_minor: parseMoney(event[3]),
            fgts_amount_minor: parseMoney(event[4]),
            installments_reduced: event[5] ? Number(event[5]) : null,
            source_pages: [page.pageNumber],
          });
          continue;
        }
      }

      const prefix = line.match(/^(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
      if (!prefix) continue;
      const values = prefix[3].split(/\s+/);
      const statusIndex = values.findIndex(
        (value, index) =>
          normalized(value) === "PAGA" ||
          (normalized(value) === "A" && normalized(values[index + 1] ?? "") === "VENCER"),
      );
      if (statusIndex < 12) continue;

      const numeric = values.slice(0, statusIndex);
      if (numeric.length !== 12) continue;
      const paid = normalized(values[statusIndex]) === "PAGA";
      const paymentOffset = paid ? statusIndex + 1 : statusIndex + 2;
      const paymentDateText = values[paymentOffset];
      const paidAmountText = values[paymentOffset + 1];
      if (!paidAmountText) continue;

      scheduleSequence += 1;
      schedule.push({
        source_sequence: scheduleSequence,
        installment_number: Number(prefix[1]),
        due_date: requiredDate(prefix[2], "a data da parcela"),
        total_amount_minor: parseMoney(numeric[0]),
        principal_minor: parseMoney(numeric[1]),
        interest_minor: parseMoney(numeric[2]),
        correction_factor: parseFactor(numeric[3]),
        insurance_mip_minor: parseMoney(numeric[4]),
        insurance_dfi_minor: parseMoney(numeric[5]),
        service_fee_minor: parseMoney(numeric[6]),
        penalty_minor: parseMoney(numeric[7]),
        late_interest_minor: parseMoney(numeric[8]),
        fgts_minor: parseMoney(numeric[9]),
        balance_correction_factor: parseFactor(numeric[10]),
        outstanding_balance_minor: parseMoney(numeric[11]),
        payment_status: paid ? "paid" : "scheduled",
        payment_date:
          paid && paymentDateText !== "-"
            ? requiredDate(paymentDateText, "a data de pagamento")
            : null,
        paid_amount_minor: parseMoney(paidAmountText),
        source_pages: [page.pageNumber],
      });
    }
  }

  if (schedule.length === 0) {
    throw new FinancingImportError(
      "invalid_data",
      "Nenhuma parcela foi reconhecida no extrato financeiro.",
    );
  }

  return { schedule, extraAmortizations };
}

export const bradescoFinancingStatementAdapter: FinancingPdfAdapter = {
  info: BRADESCO_FINANCING_ADAPTER,
  detect(document) {
    const text = normalized(document.pages.flatMap((page) => page.lines).join("\n"));
    const markers = [
      "EXTRATO FINANCEIRO",
      "CONTRATO",
      "SALDO DEVEDOR",
      "ENCARGOS",
      "MIP",
      "DFI",
      "TSA",
    ];
    const score = markers.filter((marker) => text.includes(marker)).length;
    return score === markers.length ? 1 : score / markers.length;
  },
  parse(document) {
    const contract = parseBradescoHeader(document);
    const { schedule, extraAmortizations } = parseBradescoRows(document);
    return {
      adapter: BRADESCO_FINANCING_ADAPTER,
      contract,
      schedule,
      extraAmortizations,
    };
  },
};

export const FINANCING_PDF_ADAPTERS = [
  bradescoFinancingStatementAdapter,
] as const satisfies readonly FinancingPdfAdapter[];

export function parseSupportedFinancingPdf(
  document: PdfTextDocument,
  adapters: readonly FinancingPdfAdapter[] = FINANCING_PDF_ADAPTERS,
) {
  const selected = adapters
    .map((adapter) => ({ adapter, score: adapter.detect(document) }))
    .sort((left, right) => right.score - left.score)[0];

  if (!selected || selected.score < 0.85) {
    throw new FinancingImportError(
      "unsupported_layout",
      "Este banco ou modelo de extrato de financiamento ainda não é suportado.",
    );
  }
  return selected.adapter.parse(document);
}

export type FinancingIndicators = {
  totalPaidMinor: number;
  principalPaidMinor: number;
  interestPaidMinor: number;
  chargesPaidMinor: number;
  extraCashMinor: number;
  extraFgtsMinor: number;
};

export function calculateFinancingIndicators(
  schedule: ParsedFinancingScheduleEntry[],
  extraAmortizations: ParsedFinancingExtraAmortization[],
): FinancingIndicators {
  const paid = schedule.filter((entry) => entry.payment_status === "paid");
  return {
    totalPaidMinor: paid.reduce((total, entry) => total + entry.paid_amount_minor, 0),
    principalPaidMinor: paid.reduce((total, entry) => total + entry.principal_minor, 0),
    interestPaidMinor: paid.reduce((total, entry) => total + entry.interest_minor, 0),
    chargesPaidMinor: paid.reduce(
      (total, entry) =>
        total +
        entry.insurance_mip_minor +
        entry.insurance_dfi_minor +
        entry.service_fee_minor +
        entry.penalty_minor +
        entry.late_interest_minor,
      0,
    ),
    extraCashMinor: extraAmortizations.reduce(
      (total, entry) => total + entry.cash_amount_minor,
      0,
    ),
    extraFgtsMinor: extraAmortizations.reduce(
      (total, entry) => total + entry.fgts_amount_minor,
      0,
    ),
  };
}

export type FinancingAmortizationMethod = "sac" | "price";
export type FinancingExtraAmortizationMode = "term" | "payment";

export type FinancingSimulationRow = {
  installment: number;
  principalMinor: number;
  interestMinor: number;
  extraAmortizationMinor: number;
  paymentMinor: number;
  balanceMinor: number;
};

export type FinancingSimulation = {
  rows: FinancingSimulationRow[];
  totalPaymentMinor: number;
  totalPrincipalMinor: number;
  totalInterestMinor: number;
  totalExtraAmortizationMinor: number;
  initialPaymentMinor: number;
  finalPaymentMinor: number;
};

function roundSimulationMinor(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("A simulação excede o limite seguro.");
  }
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) {
    throw new Error("A simulação excede o limite seguro.");
  }
  return rounded;
}

function pricePaymentMinor(balanceMinor: number, monthlyRate: number, months: number) {
  if (months <= 0 || balanceMinor <= 0) return 0;
  if (monthlyRate === 0) return Math.round(balanceMinor / months);
  return roundSimulationMinor(
    balanceMinor * (monthlyRate / (1 - (1 + monthlyRate) ** -months)),
  );
}

/**
 * Simula um fluxo educativo de SAC ou PRICE sem gravar parcelas no banco.
 * A amortização extra é aplicada mensalmente e pode reduzir prazo ou prestação.
 */
export function simulateFinancing(input: {
  principalMinor: number;
  annualRatePercent: number;
  termMonths: number;
  method: FinancingAmortizationMethod;
  extraAmortizationMinor?: number;
  extraAmortizationMode?: FinancingExtraAmortizationMode;
}): FinancingSimulation {
  if (
    !Number.isSafeInteger(input.principalMinor) ||
    input.principalMinor <= 0
  ) {
    throw new Error("Informe um saldo inicial válido.");
  }
  if (
    !Number.isFinite(input.annualRatePercent) ||
    input.annualRatePercent < 0 ||
    input.annualRatePercent > 100
  ) {
    throw new Error("A taxa anual deve estar entre 0% e 100%.");
  }
  if (
    !Number.isSafeInteger(input.termMonths) ||
    input.termMonths < 1 ||
    input.termMonths > 600
  ) {
    throw new Error("O prazo deve estar entre 1 e 600 meses.");
  }
  if (input.method !== "sac" && input.method !== "price") {
    throw new Error("Escolha SAC ou PRICE.");
  }

  const extraAmortizationMinor = input.extraAmortizationMinor ?? 0;
  if (
    !Number.isSafeInteger(extraAmortizationMinor) ||
    extraAmortizationMinor < 0
  ) {
    throw new Error("A amortização extra não pode ser negativa.");
  }
  const extraAmortizationMode = input.extraAmortizationMode ?? "term";
  if (extraAmortizationMode !== "term" && extraAmortizationMode !== "payment") {
    throw new Error("Escolha como a amortização extra será aplicada.");
  }

  const monthlyRate = input.annualRatePercent / 100 / 12;
  const originalPrincipal = input.principalMinor;
  let balance = originalPrincipal;
  let sacPrincipal = originalPrincipal / input.termMonths;
  let pricePayment = pricePaymentMinor(
    originalPrincipal,
    monthlyRate,
    input.termMonths,
  );
  const rows: FinancingSimulationRow[] = [];

  for (
    let installment = 1;
    installment <= input.termMonths && balance > 0;
    installment += 1
  ) {
    const remainingMonths = input.termMonths - installment + 1;
    const interest = Math.min(
      balance,
      roundSimulationMinor(balance * monthlyRate),
    );
    const scheduledPrincipal =
      input.method === "sac"
        ? Math.min(
            balance,
            installment === input.termMonths
              ? balance
              : Math.max(1, roundSimulationMinor(sacPrincipal)),
          )
        : Math.min(
            balance,
            Math.max(0, roundSimulationMinor(pricePayment - interest)),
          );
    const extra = Math.min(
      extraAmortizationMinor,
      Math.max(0, balance - scheduledPrincipal),
    );
    const payment = roundSimulationMinor(interest + scheduledPrincipal);
    balance = Math.max(0, balance - scheduledPrincipal - extra);

    rows.push({
      installment,
      principalMinor: scheduledPrincipal,
      interestMinor: interest,
      extraAmortizationMinor: extra,
      paymentMinor: payment,
      balanceMinor: balance,
    });

    const nextMonths = remainingMonths - 1;
    if (nextMonths > 0 && balance > 0 && extra > 0 && extraAmortizationMode === "payment") {
      if (input.method === "sac") {
        sacPrincipal = balance / nextMonths;
      } else {
        pricePayment = pricePaymentMinor(balance, monthlyRate, nextMonths);
      }
    }
  }

  return {
    rows,
    totalPaymentMinor: rows.reduce(
      (total, row) => total + row.paymentMinor + row.extraAmortizationMinor,
      0,
    ),
    totalPrincipalMinor: rows.reduce(
      (total, row) => total + row.principalMinor + row.extraAmortizationMinor,
      0,
    ),
    totalInterestMinor: rows.reduce(
      (total, row) => total + row.interestMinor,
      0,
    ),
    totalExtraAmortizationMinor: rows.reduce(
      (total, row) => total + row.extraAmortizationMinor,
      0,
    ),
    initialPaymentMinor: rows[0]?.paymentMinor ?? 0,
    finalPaymentMinor: rows.at(-1)?.paymentMinor ?? 0,
  };
}

export const financingImportJobIdSchema = z.uuid("Importação inválida.");

export const financingImportConfirmationSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome.").max(100),
  productType: z.enum(["financing", "loan"]),
  context: z.enum(["personal", "professional"]),
});

const manualMoneyInput = z.string().trim().transform((value, context) => {
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
});

const optionalRateInput = z
  .string()
  .trim()
  .transform((value) => value.replace("%", "").replace(",", "."))
  .refine((value) => value === "" || /^\d+(?:\.\d{1,8})?$/.test(value), {
    message: "Informe uma taxa válida.",
  })
  .transform((value) => value || null);

const optionalFactorInput = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine((value) => value === "" || /^\d+(?:\.\d{1,10})?$/.test(value), {
    message: "Informe um fator válido.",
  })
  .transform((value) => value || null);

const manualScheduleRowSchema = z
  .object({
    installmentNumber: z.coerce.number().int().min(0).max(10000),
    dueDate: z.string().refine(isValidIsoDate, "Informe uma data válida."),
    totalAmountMinor: manualMoneyInput.refine((value) => value >= 0),
    principalMinor: manualMoneyInput.refine((value) => value >= 0),
    interestMinor: manualMoneyInput.refine((value) => value >= 0),
    correctionFactor: optionalFactorInput,
    chargesMinor: manualMoneyInput.refine((value) => value >= 0),
    outstandingBalanceMinor: manualMoneyInput.refine((value) => value >= 0),
    paymentStatus: z.enum(["paid", "scheduled"]),
    paymentDate: z.string(),
    paidAmountMinor: manualMoneyInput.refine((value) => value >= 0),
  })
  .superRefine((row, context) => {
    if (row.paymentStatus === "paid" && !isValidIsoDate(row.paymentDate)) {
      context.addIssue({
        code: "custom",
        path: ["paymentDate"],
        message: "Informe a data de pagamento.",
      });
    }
    if (row.paymentStatus === "scheduled" && row.paymentDate !== "") {
      context.addIssue({
        code: "custom",
        path: ["paymentDate"],
        message: "Parcela a vencer não deve ter data de pagamento.",
      });
    }
  });

const manualScheduleInput = z
  .string()
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({
        code: "custom",
        message: "A tabela de parcelas é inválida.",
      });
      return z.NEVER;
    }
  })
  .pipe(z.array(manualScheduleRowSchema).min(1, "Inclua ao menos uma parcela."));

export const manualFinancingContractSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome.").max(100),
  institution: z.string().trim().min(1, "Informe a instituição.").max(120),
  contractReference: z.string().trim().min(1, "Informe o contrato.").max(80),
  productType: z.enum(["financing", "loan"]),
  context: z.enum(["personal", "professional"]),
  currency: z.enum(SUPPORTED_CURRENCIES),
  amortizationSystem: z.enum(["SAC", "PRICE"]),
  indexer: z.string().trim().max(40).transform((value) => value || null),
  originalPrincipalMinor: manualMoneyInput.refine(
    (value) => value > 0,
    "Informe o principal original.",
  ),
  originalTermMonths: z.coerce.number().int().min(1).max(1200),
  contractDate: z.string().refine(isValidIsoDate, "Informe uma data válida."),
  releaseDate: z
    .string()
    .refine((value) => value === "" || isValidIsoDate(value), "Informe uma data válida.")
    .transform((value) => value || null),
  currentBalanceMinor: manualMoneyInput.refine((value) => value >= 0),
  balanceDate: z.string().refine(isValidIsoDate, "Informe uma data válida."),
  nominalAnnualRate: optionalRateInput,
  effectiveAnnualRate: optionalRateInput,
  cetAnnualRate: optionalRateInput,
  schedule: manualScheduleInput,
});

export type ManualFinancingContractInput = z.infer<
  typeof manualFinancingContractSchema
>;
