import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { formatMoney } from "@/domain/money";
import { SUPPORTED_CURRENCIES } from "@/domain/currencies";
import { listCurrentUserReportEntryDetails } from "@/services/reports/report-entry-details-service";
import { formatIsoDatePtBr } from "@/utils/dates";

export const metadata = { title: "Lançamentos do relatório" };

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const uuidPattern = /^[0-9a-f-]{36}$/i;

export default async function ReportEntriesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const fromMonth = value("from");
  const toMonth = value("to");
  const validPeriod = monthPattern.test(fromMonth) && monthPattern.test(toMonth) && fromMonth <= toMonth;
  const section = value("section") === "income" || value("section") === "expense" ? value("section") as "income" | "expense" : undefined;
  const rowIds = value("rows").split(",").filter((row) => row.length > 0 && (uuidPattern.test(row) || /^[a-z-]+:[a-z-]+$/.test(row)));
  const sourceKeys = value("sources").split(",").filter((row) => /^(account|card):[0-9a-f-]{36}$/i.test(row));
  const context = value("context") === "personal" || value("context") === "professional" ? value("context") as "personal" | "professional" : undefined;
  const currencies = SUPPORTED_CURRENCIES.filter((currency) => value("currencies").split(",").includes(currency));
  const basis = value("basis") === "cash" ? "cash" as const : "competence" as const;
  const result = validPeriod ? await listCurrentUserReportEntryDetails({ fromMonth, toMonth, basis, section, rowIds, sourceKeys, context, currencies }) : { entries: [], hasError: false };
  const totals = new Map<string, number>();
  for (const row of result.entries) {
    const key = `${row.currency}:${row.section}`;
    totals.set(key, (totals.get(key) ?? 0) + row.amount_minor);
  }

  return <main className="app-page grid gap-3">
    <Link href="/reports" className="w-fit text-sm font-semibold text-emerald-800 hover:underline">← Voltar aos relatórios</Link>
    <PageHeader title="Lançamentos do relatório" description={validPeriod ? `${fromMonth} a ${toMonth} · ${basis === "cash" ? "caixa" : "competência"}` : "Selecione um período no relatório."} />
    <p className="text-xs text-slate-600">Valores na moeda de origem de cada lançamento. O consolidado pode diferir porque converte as moedas para a moeda do perfil.</p>
    {result.hasError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Não foi possível carregar todos os lançamentos deste consolidado.</p> : null}
    {totals.size ? <div className="flex flex-wrap gap-2">{[...totals].map(([key, amount]) => {
      const [currency, kind] = key.split(":");
      return <span key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold">{kind === "income" ? "Receitas" : "Despesas"}: {formatMoney(amount, currency)}</span>;
    })}</div> : null}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Extrato do consolidado">
      {result.entries.length ? <div className="divide-y divide-slate-100">{result.entries.map((row) => {
        const [sourceType, sourceId] = row.source_key.split(":");
        const href = sourceType === "card" ? `/credit-cards/${sourceId}` : `/accounts/${sourceId}`;
        const sourceLabel = row.entry_kind === "card_installment" ? "Cartão" : row.entry_kind === "investment_income" ? "Renda de investimento" : row.entry_kind === "card_payment" ? "Pagamento de cartão" : "Conta";
        return <div key={`${row.entry_kind}:${row.entry_id}:${row.basis}`} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[6.5rem_minmax(0,1fr)_8rem_8rem] sm:items-center">
          <time className="text-xs tabular-nums text-slate-500">{formatIsoDatePtBr(row.entry_date)}</time>
          <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{row.description}</p><p className="text-xs text-slate-500">{sourceLabel} · {row.section === "income" ? "Receita" : "Despesa"}</p></div>
          <span className={`text-right font-semibold tabular-nums ${row.section === "income" ? "text-emerald-700" : "text-rose-700"}`}>{row.section === "income" ? "+" : "−"}{formatMoney(row.amount_minor, row.currency)}</span>
          <Link href={href} className="text-right text-xs font-semibold text-emerald-800 hover:underline">Abrir origem →</Link>
        </div>;
      })}</div> : <p className="p-6 text-center text-sm text-slate-600">Nenhum lançamento encontrado para este recorte.</p>}
    </section>
  </main>;
}
