import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelFinancialImport,
  configureFinancialImport,
  confirmFinancialImport,
} from "@/app/actions/file-imports";
import { inputClass } from "@/components/forms/form-control-styles";
import { ImportStagingRowForm } from "@/components/forms/import-staging-row-form";
import { QifMappingPanel } from "@/components/forms/qif-mapping-panel";
import { getCurrentUserImportReview } from "@/services/finance/file-imports-service";

export const metadata = { title: "Revisar importação" };

const messages: Record<string, string> = {
  uploaded: "Arquivo lido. Agora associe a conta e revise as categorias.",
  "account-updated":
    "Conta associada e duplicidades recalculadas com sucesso.",
  "row-updated": "Linha atualizada e validada novamente.",
  "row-ignored":
    "Linha ignorada. Ela não será importada nem bloqueará a confirmação.",
  "row-reincluded": "Linha reincluída e avaliada novamente.",
  "mapping-updated": "Mapeamento aplicado às linhas correspondentes.",
  "row-error": "Não foi possível corrigir a linha.",
  "configuration-error": "Não foi possível associar a conta.",
  confirmed: "Importação concluída de forma atômica.",
  "confirmation-error":
    "A importação não foi confirmada. Revise pendências e duplicidades.",
};

export default async function ImportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; page?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const {
    job,
    rows,
    accounts,
    creditCards,
    categories,
    groups,
    pagination,
    hasError,
  } =
    await getCurrentUserImportReview(id, Number(query.page) || 1);
  if (!job && !hasError) notFound();
  const feedback = query.message ? messages[query.message] : undefined;
  const feedbackIsError = query.message?.endsWith("error");

  if (!job) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Não foi possível carregar esta importação.
        </p>
      </main>
    );
  }

  const isFinished = job.status === "completed" || job.status === "cancelled";

  return (
    <main className="mx-auto grid max-w-6xl gap-7 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/imports"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para importações
        </Link>
        <p className="mt-6 text-sm font-bold uppercase tracking-widest text-blue-700">
          {isFinished ? "Resumo" : "Etapas 2 e 3"}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
          {job.file_name}
        </h1>
        <p className="mt-2 text-slate-600">
          {job.file_type.toUpperCase()} · {job.source_row_count} linhas ·
          arquivo original descartado após a leitura
        </p>
        {job.source_adapter_id ? (
          <p className="mt-1 text-sm text-slate-500">
            Adaptador: {job.source_adapter_id}
            {job.source_document_type
              ? ` · ${job.source_document_type}`
              : ""}
          </p>
        ) : null}
      </div>

      {feedback ? (
        <p
          role={feedbackIsError ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedbackIsError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedback}
        </p>
      ) : null}

      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Parte da prévia não pôde ser carregada. Confirme todas as migrations
          de importação no Supabase.
        </p>
      ) : null}

      {job.status === "completed" ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-xl font-bold text-emerald-950">
            Importação concluída
          </h2>
          <p className="mt-2 text-emerald-900">
            {job.imported_row_count}{" "}
            {job.imported_row_count === 1
              ? "movimentação foi gravada"
              : "movimentações foram gravadas"}{" "}
            em uma
            única transação. Os dados de staging foram descartados.
          </p>
          <Link
            href="/transactions"
            className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white"
          >
            Ver movimentações
          </Link>
        </section>
      ) : null}

      {job.status === "cancelled" ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold text-slate-950">
            Importação cancelada
          </h2>
          <p className="mt-2 text-slate-600">
            O arquivo e as linhas temporárias foram descartados. Nenhum
            lançamento foi criado.
          </p>
        </section>
      ) : null}

      {!isFinished ? (
        <>
          <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:grid-cols-[1fr_auto]">
            <form
              action={configureFinancialImport}
              className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
            >
              <input type="hidden" name="jobId" value={job.id} />
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                {job.file_type === "qif"
                  ? "Conta representada pelo arquivo"
                  : "Conta de destino"}
                <select
                  className={inputClass()}
                  name="accountId"
                  defaultValue={job.account_id ?? ""}
                  required
                >
                  <option value="">Selecione uma conta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </option>
                  ))}
                </select>
              </label>
              <button className="min-h-12 rounded-xl border border-blue-200 px-4 font-semibold text-blue-700 hover:bg-blue-50">
                Associar e verificar
              </button>
            </form>

            <dl className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-slate-500">Total</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">
                  {job.source_row_count}
                </dd>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <dt className="text-emerald-700">Prontas</dt>
                <dd className="mt-1 text-lg font-bold text-emerald-950">
                  {job.valid_row_count}
                </dd>
              </div>
              <div className="rounded-xl bg-violet-50 p-3">
                <dt className="text-violet-700">Duplicadas</dt>
                <dd className="mt-1 text-lg font-bold text-violet-950">
                  {job.duplicate_row_count}
                </dd>
              </div>
            </dl>
          </section>

          {job.file_type === "qif" ? (
            <QifMappingPanel
              jobId={job.id}
              rows={rows}
              accounts={accounts}
              categories={categories}
              sourceAccountId={job.account_id}
              page={pagination.page}
            />
          ) : null}

          <section className="grid gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">
                Prévia e correções
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Valor positivo gera receita; valor negativo gera despesa.
                {job.file_type === "qif"
                  ? " Referências entre colchetes são transferências e precisam da conta correspondente."
                  : " Corrija os dados e associe uma categoria compatível."}
              </p>
            </div>
            {rows.map((row) => (
              <ImportStagingRowForm
                key={row.id}
                jobId={job.id}
                row={row}
                categories={categories}
                groups={groups}
                accounts={accounts}
                creditCards={creditCards}
                page={pagination.page}
              />
            ))}
            {pagination.totalPages > 1 ? (
              <nav
                aria-label="Páginas da revisão"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <Link
                  aria-disabled={pagination.page <= 1}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                    pagination.page <= 1
                      ? "pointer-events-none border-slate-200 text-slate-400"
                      : "border-blue-200 text-blue-700 hover:bg-blue-50"
                  }`}
                  href={`/imports/${job.id}?page=${Math.max(1, pagination.page - 1)}`}
                >
                  Página anterior
                </Link>
                <span className="text-sm text-slate-600">
                  Página {pagination.page} de {pagination.totalPages} ·{" "}
                  {pagination.totalRows} linhas em revisão
                </span>
                <Link
                  aria-disabled={pagination.page >= pagination.totalPages}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                    pagination.page >= pagination.totalPages
                      ? "pointer-events-none border-slate-200 text-slate-400"
                      : "border-blue-200 text-blue-700 hover:bg-blue-50"
                  }`}
                  href={`/imports/${job.id}?page=${Math.min(
                    pagination.totalPages,
                    pagination.page + 1,
                  )}`}
                >
                  Próxima página
                </Link>
              </nav>
            ) : null}
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-950">
                Confirmação explícita
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                A confirmação grava somente linhas prontas e selecionadas. Se
                qualquer gravação falhar, todas serão revertidas.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <form action={cancelFinancialImport}>
                <input type="hidden" name="jobId" value={job.id} />
                <button className="min-h-12 w-full rounded-xl border border-slate-300 px-4 font-semibold text-slate-700 hover:bg-slate-50">
                  Cancelar e descartar
                </button>
              </form>
              <form action={confirmFinancialImport}>
                <input type="hidden" name="jobId" value={job.id} />
                <button
                  disabled={job.status !== "ready"}
                  className="min-h-12 w-full rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Confirmar importação
                </button>
              </form>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
