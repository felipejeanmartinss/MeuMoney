import Link from "next/link";
import { TransferForm } from "@/components/forms/transfer-form";
import { listCurrentUserPayableCreditCardDestinations } from "@/services/finance/credit-cards-service";
import { getTransferFormOptions } from "@/services/finance/transfers-service";

export const metadata = { title: "Nova transferência" };

export default async function NewTransferPage() {
  const [formOptions, cardPaymentOptions] = await Promise.all([
    getTransferFormOptions(),
    listCurrentUserPayableCreditCardDestinations(),
  ]);
  const { accounts, hasError } = formOptions;
  const today = new Date().toISOString().slice(0, 10);
  const hasCompatiblePair = accounts.some(
    (source, index) =>
      accounts
        .slice(index + 1)
        .some((destination) => destination.currency === source.currency) ||
      cardPaymentOptions.destinations.some(
        (destination) => destination.currency === source.currency,
      ),
  );

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/transfers"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para transferências
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Nova transferência
        </h1>
        <p className="mt-2 text-slate-600">
          A saída e a entrada serão registradas juntas, de forma atômica.
        </p>
      </div>

      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Não foi possível carregar suas contas.
        </p>
      ) : null}

      {!hasError && !hasCompatiblePair ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-bold">Não há um destino compatível</h2>
          <p className="mt-2 text-sm leading-6">
            Cadastre ou reative outra conta da mesma moeda, ou feche uma fatura
            de cartão para disponibilizá-la como destino de pagamento.
          </p>
          <Link
            href="/accounts/new"
            className="mt-4 inline-flex font-semibold text-blue-700 hover:underline"
          >
            Cadastrar conta
          </Link>
        </div>
      ) : null}

      {!hasError && hasCompatiblePair ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <TransferForm
            accounts={accounts}
            creditCardPaymentDestinations={cardPaymentOptions.destinations}
            values={{ transactionDate: today, status: "completed" }}
          />
        </section>
      ) : null}
    </main>
  );
}
