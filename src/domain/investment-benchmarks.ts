export const INVESTMENT_BENCHMARKS = [
  { code: "cdi", label: "CDI", description: "Referência para renda fixa pós-fixada." },
  { code: "selic", label: "SELIC", description: "Taxa básica de juros da economia." },
  { code: "ipca", label: "IPCA", description: "Inflação oficial para medir retorno real." },
  { code: "ibovespa", label: "Ibovespa", description: "Referência ampla para ações brasileiras." },
  { code: "ifix", label: "IFIX", description: "Referência para fundos imobiliários." },
  { code: "usd", label: "Dólar", description: "Variação cambial de referência." },
] as const;

export type InvestmentBenchmarkCode = (typeof INVESTMENT_BENCHMARKS)[number]["code"];

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
