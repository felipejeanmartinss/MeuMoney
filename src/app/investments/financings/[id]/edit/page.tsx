import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FinancingNavigation } from "@/components/financing/financing-navigation";
import { ManualFinancingForm } from "@/components/forms/manual-financing-form";
import { getCurrentUserFinancingContract } from "@/services/finance/financing-imports-service";

export default async function EditFinancingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCurrentUserFinancingContract(id);
  if (result.hasError) return <main className="app-page"><PageHeader title="Editar financiamento" back={{ href: "/investments?tab=financing", label: "Financiamentos" }} /><p role="alert">Não foi possível carregar o fluxo completo. Tente novamente antes de editar.</p></main>;
  if (!result.contract) notFound();
  return <main className="app-page"><PageHeader title={result.contract.name} description="Ajuste o contrato e as parcelas; salve quando terminar." back={{ href: "/investments?tab=financing", label: "Financiamentos" }} /><FinancingNavigation base={`/investments/financings/${id}`} active="flow" /><ManualFinancingForm contract={result.contract} schedule={result.schedule} /></main>;
}
