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
      description="Tente carregar novamente. Se o problema continuar, confirme se a migration da Sprint 9 foi aplicada ao Supabase deste ambiente."
      reset={reset}
    />
  );
}
