"use client";

import { FinancialRouteError } from "@/components/ui/financial-route-error";

export default function RecurringTransactionsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FinancialRouteError
      title="Suas contas a pagar estão temporariamente indisponíveis"
      description="Tente carregar novamente. Se o problema continuar, confirme se todas as migrations do Supabase foram aplicadas na ordem."
      reset={reset}
    />
  );
}
