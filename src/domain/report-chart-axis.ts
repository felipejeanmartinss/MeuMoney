// Money stays in integer minor units; the display axis uses whole major units.
export function roundedAxisMaximumMinor(maximumMinor: number, tickCount = 4) {
  if (!Number.isSafeInteger(maximumMinor) || maximumMinor < 0) {
    throw new Error("O máximo do gráfico deve ser um valor inteiro não negativo em centavos.");
  }
  const targetStepMajor = Math.max(1, Math.ceil(maximumMinor / 100 / tickCount));
  const magnitude = 10 ** Math.floor(Math.log10(targetStepMajor));
  const stepMajor = [1, 2, 5, 10]
    .map((factor) => factor * magnitude)
    .find((candidate) => candidate >= targetStepMajor) ?? 10 * magnitude;
  return stepMajor * tickCount * 100;
}
