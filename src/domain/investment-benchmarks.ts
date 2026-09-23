export const INVESTMENT_BENCHMARKS = [
  { code: "cdi", label: "CDI", description: "Referência para renda fixa pós-fixada." },
  { code: "selic", label: "SELIC", description: "Taxa básica de juros da economia." },
  { code: "ipca", label: "IPCA", description: "Inflação oficial para medir retorno real." },
  { code: "ibovespa", label: "Ibovespa", description: "Referência ampla para ações brasileiras." },
  { code: "ifix", label: "IFIX", description: "Referência para fundos imobiliários." },
  { code: "usd", label: "Dólar", description: "Variação cambial de referência." },
] as const;

export type InvestmentBenchmarkCode = (typeof INVESTMENT_BENCHMARKS)[number]["code"];

export function benchmarkMonths(startMonth: string, endMonth: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth) || startMonth > endMonth) throw new Error("Informe um período válido.");
  const result: string[] = [];
  const date = new Date(`${startMonth}-01T12:00:00Z`);
  while (date.toISOString().slice(0, 7) <= endMonth) {
    if (result.length >= 600) throw new Error("Selecione até 50 anos.");
    result.push(date.toISOString().slice(0, 10));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return result;
}

export type BenchmarkPosition = { id: string; name: string; historyIsComplete: boolean; currency: string };
export type BenchmarkSnapshot = { positionId: string; date: string; valueMinor: number };
export type BenchmarkFlow = { positionId: string; date: string; amountMinor: number; type: string };
export type MonthlyBenchmark = { code: string; reference_month: string; return_percent: string | number };

export function compareInvestmentBenchmarks(input: {
  positions: BenchmarkPosition[]; snapshots: BenchmarkSnapshot[]; flows: BenchmarkFlow[];
  months: string[]; benchmarks: MonthlyBenchmark[];
}) {
  const gaps: string[] = [];
  const points: { month: string; returnBasisPoints: number }[] = [];
  if (!input.positions.length) gaps.push("Selecione um ativo ou uma classe com posições cadastradas.");
  for (const position of input.positions) {
    if (!position.historyIsComplete) gaps.push(`${position.name}: histórico marcado como incompleto.`);
    if (position.currency !== "BRL") gaps.push(`${position.name}: a comparação com estes índices exige valores em BRL.`);
  }
  let accumulated = 1;
  for (const month of input.months) {
    const start = new Date(`${month}T12:00:00Z`);
    const previousEnd = new Date(start); previousEnd.setUTCDate(0);
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
    const openingDate = previousEnd.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const days = BigInt(end.getUTCDate());
    let opening = 0n, closing = 0n, netFlows = 0n, weightedFlows = 0n, income = 0n;
    for (const position of input.positions) {
      const snapshots = input.snapshots.filter((row) => row.positionId === position.id);
      const first = snapshots.findLast((row) => row.date === openingDate);
      const last = snapshots.findLast((row) => row.date === endDate);
      if (!first || !last) { gaps.push(`${position.name}: falta posição em ${!first ? openingDate : endDate}.`); continue; }
      opening += BigInt(first.valueMinor); closing += BigInt(last.valueMinor);
      for (const flow of input.flows.filter((row) => row.positionId === position.id && row.date >= month && row.date <= endDate)) {
        const amount = BigInt(flow.amountMinor);
        if (flow.type === "income") { income += amount; continue; }
        if (flow.type !== "contribution" && flow.type !== "redemption") continue;
        const signed = flow.type === "contribution" ? amount : -amount;
        netFlows += signed;
        weightedFlows += signed * (days - BigInt(Number(flow.date.slice(8, 10))));
      }
    }
    const denominator = opening * days + weightedFlows;
    if (denominator <= 0n) { gaps.push(`${month.slice(0, 7)}: capital insuficiente para calcular o retorno.`); continue; }
    const gain = closing - opening - netFlows + income;
    const rate = Number(gain * days * 1_000_000_000n / denominator) / 1_000_000_000;
    if (rate < -1) { gaps.push(`${month.slice(0, 7)}: movimentações incompatíveis com os saldos.`); continue; }
    accumulated *= 1 + rate;
    points.push({ month, returnBasisPoints: Math.round((accumulated - 1) * 10_000) });
  }
  const valid = !gaps.length && points.length === input.months.length && points.length > 0;
  const portfolioReturn = valid ? Math.round((accumulated - 1) * 10_000) : null;
  const comparisons = INVESTMENT_BENCHMARKS.map((benchmark) => {
    let growth = 1;
    const missing: string[] = [];
    const series = input.months.map((month) => {
      const observation = input.benchmarks.find((row) => row.code === benchmark.code && row.reference_month === month);
      if (!observation || !Number.isFinite(Number(observation.return_percent))) { missing.push(month); return { month, returnBasisPoints: null }; }
      growth *= 1 + Number(observation.return_percent) / 100;
      return { month, returnBasisPoints: Math.round((growth - 1) * 10_000) };
    });
    const result = missing.length || !input.months.length ? null : Math.round((growth - 1) * 10_000);
    return { ...benchmark, missing, series: missing.length ? [] : series, returnBasisPoints: result,
      spreadBasisPoints: result !== null && portfolioReturn !== null ? portfolioReturn - result : null };
  });
  const inflation = comparisons.find((row) => row.code === "ipca")?.returnBasisPoints;
  return { gaps: [...new Set(gaps)], points: valid ? points : [], portfolioReturn, comparisons,
    realReturn: portfolioReturn !== null && inflation != null && inflation > -10_000 ? calculateRealReturn(portfolioReturn, inflation) : null };
}

export function calculateRealReturn(
  portfolioReturnBasisPoints: number,
  inflationBasisPoints: number,
) {
  const portfolio = 1 + portfolioReturnBasisPoints / 10_000;
  const inflation = 1 + inflationBasisPoints / 10_000;
  return Math.round(((portfolio / inflation) - 1) * 10_000);
}

export function calculateBenchmarkSpread(
  portfolioReturnBasisPoints: number,
  benchmarkReturnBasisPoints: number,
) {
  return portfolioReturnBasisPoints - benchmarkReturnBasisPoints;
}
