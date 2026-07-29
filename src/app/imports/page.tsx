import Link from "next/link";
import { clearCancelledFinancialImports } from "@/app/actions/file-imports";
import { listCurrentUserImportJobs } from "@/services/finance/file-imports-service";

export const metadata = { title: "Importações" };

const statusPresentation = {
  review: { label: "Em revisão", className: "bg-amber-100 text-amber-800" },
  ready: {
    label: "Pronta para confirmar",
    className: "bg-emerald-100 text-emerald-800",
  },
  completed: { label: "Concluída", className: "bg-blue-100 text-blue-800" },
  cancelled: { label: "Cancelada", className: "bg-slate-100 text-slate-700" },
  failed: { label: "Falhou", className: "bg-red-100 text-red-800" },
} as const;

const messages: Record<string, string> = {
  cancelled: "Importação cancelada e dados temporários descartados.",
  "cancelled-cleared": "Importações canceladas removidas da lista.",
  "cancel-error": "Não foi possível cancelar a importação.",
  "clear-error": "Não foi possível limpar as importações canceladas.",
  "configuration-error": "Não foi possível configurar a importação.",
  "confirmation-error": "Não foi possível confirmar a importação.",
  "row-error": "Não foi possível atualizar a linha.",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ jobs, hasError }, params] = await Promise.all([
    listCurrentUserImportJobs(),
    searchParams,
  ]);
  const feedback = params.message ? messages[params.message] : undefined;
  const feedbackIsError = params.message?.endsWith("error");
  const hasCancelledJobs = jobs.some((job) => job.status === "cancelled");

  return (
    <main className="mx-auto grid max-w-6xl gap-7 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Entrada assistida
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Importações
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Revise CSV, OFX, QIF e PDF em uma área temporária antes de alterar seu
            histórico financeiro.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {hasCancelledJobs ? (
            <form action={clearCancelledFinancialImports}>
              <button className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 px-5 font-semibold text-slate-700 hover:bg-slate-100">
                Limpar canceladas
              </button>
            </form>
          ) : null}
          <Link
            href="/imports/new"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-700 px-5 font-semibold text-white shadow-sm hover:bg-emerald-800"
          >
            Nova importação
          </Link>
        </div>
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
          Não foi possível carregar as importações. Tente novamente.
        </p>
      ) : null}

      {!hasError && jobs.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            Nenhuma importação iniciada
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-600">
            Envie um arquivo, confira a prévia, associe conta e categorias e só
            então confirme os lançamentos.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        {jobs.map((job) => {
          const presentation = statusPresentation[job.status];
          return (
            <article
              key={job.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    {job.file_type.toUpperCase()}
                  </p>
                  <h2 className="mt-1 truncate text-lg font-bold text-slate-950">
                    {job.file_name}
                  </h2>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${presentation.className}`}
                >
                  {presentation.label}
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt>Linhas encontradas</dt>
                  <dd className="font-semibold text-slate-950">
                    {job.source_row_count}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Importadas</dt>
                  <dd className="font-semibold text-slate-950">
                    {job.imported_row_count}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-slate-500">
                Iniciada em {formatDateTime(job.created_at)}
              </p>
              <Link
                href={`/imports/${job.id}`}
                className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-blue-200 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                {job.status === "completed" || job.status === "cancelled"
                  ? "Ver resumo"
                  : "Continuar revisão"}
              </Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
