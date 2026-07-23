import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountForm } from "@/components/forms/account-form";
import { accountIdSchema } from "@/domain/accounts";
import { minorUnitsToInput } from "@/domain/money";
import { getCurrentUserAccount } from "@/services/finance/accounts-service";

export const metadata = { title: "Editar conta" };

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsedId = accountIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const { account, hasError } = await getCurrentUserAccount(parsedId.data);
  if (hasError || !account) notFound();

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/accounts"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para contas
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Editar conta
        </h1>
        <p className="mt-2 text-slate-600">
          Atualize os dados estruturais da conta e seu saldo inicial.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <AccountForm
          values={{
            id: account.id,
            name: account.name,
            type: account.type,
            context: account.context,
            currency: account.currency,
            openingBalanceMinor: minorUnitsToInput(
              account.opening_balance_minor,
            ),
            openingBalanceDate: account.opening_balance_date,
          }}
        />
      </section>
    </main>
  );
}
