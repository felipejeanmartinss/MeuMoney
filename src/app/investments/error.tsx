"use client";

import { FinancialRouteError } from "@/components/ui/financial-route-error";

export default function InvestmentsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FinancialRouteError
      title="Seus investimentos estão temporariamente indisponíveis"
      description="Não conseguimos carregar os dados. Tente novamente em instantes."
      reset={reset}
    />
  );
}
