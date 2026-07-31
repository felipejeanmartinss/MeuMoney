"use client";

import { FinancialRouteError } from "@/components/ui/financial-route-error";

export default function NetWorthError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <FinancialRouteError
      title="Seu patrimônio está temporariamente indisponível"
      description="Tente carregar novamente. Se o problema continuar, confirme se a migration da Sprint 8 foi aplicada ao Supabase deste ambiente."
      reset={reset}
    />
  );
}
