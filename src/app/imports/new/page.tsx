import Link from "next/link";
import { FileImportForm } from "@/components/forms/file-import-form";
import { listCurrentUserAccounts } from "@/services/finance/accounts-service";
import { listCurrentUserTransferCreditCardDestinations } from "@/services/finance/credit-cards-service";

export const metadata = { title: "Nova importação" };

export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; creditCardId?: string }>;
}) {
  const [{ accountId, creditCardId }, { accounts }, cardResult] = await Promise.all([
    searchParams,
    listCurrentUserAccounts(),
    listCurrentUserTransferCreditCardDestinations(),
  ]);
  const activeAccounts = accounts
    .filter((account) => !account.archived_at)
    .map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    }));
  const selectedAccountId = activeAccounts.some(
    (account) => account.id === accountId,
  )
    ? accountId
    : undefined;
  const selectedCreditCardId = cardResult.destinations.some(
    (card) => card.id === creditCardId,
  )
    ? creditCardId
    : undefined;

  return (
    <main className="mx-auto grid max-w-4xl gap-7 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/imports"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para importações
        </Link>
        <p className="mt-6 text-sm font-bold uppercase tracking-widest text-blue-700">
          Etapa 1 de 3
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
          Ler arquivo
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          O arquivo é lido apenas para normalizar a prévia. Nenhum lançamento
          entra no histórico nesta etapa.
        </p>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <FileImportForm
          accounts={activeAccounts}
          creditCards={cardResult.destinations}
          defaultAccountId={selectedAccountId}
          defaultCreditCardId={selectedCreditCardId}
        />
      </section>
    </main>
  );
}
