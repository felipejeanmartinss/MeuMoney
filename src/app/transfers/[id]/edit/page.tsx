import Link from "next/link";
import { notFound } from "next/navigation";
import { TransferForm } from "@/components/forms/transfer-form";
import { minorUnitsToInput } from "@/domain/money";
import { transferIdSchema } from "@/domain/transfers";
import {
  getCurrentUserTransfer,
  getTransferFormOptions,
} from "@/services/finance/transfers-service";

export const metadata = { title: "Editar transferência" };

export default async function EditTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsedId = transferIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const [{ transfer, hasError }, options] = await Promise.all([
    getCurrentUserTransfer(parsedId.data),
    getTransferFormOptions(),
  ]);
  if (hasError || !transfer) notFound();

  const canEditAccounts =
    options.accounts.some(
      (account) => account.id === transfer.source_account_id,
    ) &&
    (transfer.destination_account_id
      ? options.accounts.some(
          (account) => account.id === transfer.destination_account_id,
        )
      : options.creditCards.some(
          (card) => card.id === transfer.destination_credit_card_id,
        ));

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
          Editar transferência
        </h1>
        <p className="mt-2 text-slate-600">
          A origem e o destino serão recalculados juntos ao salvar.
        </p>
      </div>

      {options.hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Não foi possível carregar suas contas.
        </p>
      ) : null}

      {!options.hasError && !canEditAccounts ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"
        >
          Reative a origem e o destino para editar esta transferência.
          Você ainda pode inativá-la pela lista de transferências.
        </p>
      ) : null}

      {!options.hasError && canEditAccounts ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <TransferForm
            accounts={options.accounts}
            creditCards={options.creditCards}
            values={{
              id: transfer.id,
              sourceAccountId: transfer.source_account_id,
              destinationAccountId:
                transfer.destination_account_id ?? undefined,
              destinationCreditCardId:
                transfer.destination_credit_card_id ?? undefined,
              amountMinor: minorUnitsToInput(transfer.amount_minor),
              destinationAmountMinor: minorUnitsToInput(
                transfer.destination_amount_minor ?? transfer.amount_minor,
              ),
              transactionDate: transfer.transaction_date,
              status: transfer.status,
              description: transfer.description ?? "",
              notes: transfer.notes ?? "",
            }}
          />
        </section>
      ) : null}
    </main>
  );
}
