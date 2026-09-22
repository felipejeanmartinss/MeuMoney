import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ManualFinancingForm } from "@/components/forms/manual-financing-form";
import { getCurrentUserFinancingContract } from "@/services/finance/financing-imports-service";
import { getFinancingPaymentOptions } from "@/services/finance/financing-payments-service";

export default async function EditFinancingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCurrentUserFinancingContract(id);
  if (result.hasError) return <main className="app-page"><PageHeader title="Editar financiamento" back={{ href: "/investments?tab=financing", label: "Financiamentos" }} /><p role="alert">Não foi possível carregar o fluxo completo. Tente novamente antes de editar.</p></main>;
  if (!result.contract) notFound();
  const options = await getFinancingPaymentOptions(result.contract.currency);
  return <main className="app-page"><PageHeader title={result.contract.name} description="Ajuste o contrato e as parcelas; salve quando terminar." back={{ href: `/investments/financings/${id}`, label: "Financiamento" }} />{options.hasError ? <p role="alert" className="text-sm text-amber-800">Não foi possível carregar novos lançamentos para vínculo. Os vínculos atuais serão preservados.</p> : null}<ManualFinancingForm contract={result.contract} schedule={result.schedule} transactions={options.transactions} /></main>;
}
