import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FINANCIAL_GOAL_STATUS_LABELS, FINANCIAL_GOAL_TYPE_LABELS } from "@/domain/financial-goals";
import { formatMoney } from "@/domain/money";
import { listCurrentUserFinancialGoals } from "@/services/finance/financial-goals-service";
import { formatIsoDatePtBr } from "@/utils/dates";

export const metadata = { title: "Metas" };

function statusClass(status: string) {
  return status === "completed" ? "bg-emerald-100 text-emerald-800" : status === "paused" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
}

export default async function GoalsPage() {
  const data = await listCurrentUserFinancialGoals();
  const activeGoals = data.goals.filter((goal) => goal.status === "active");
  const completed = data.goals.filter((goal) => goal.status === "completed").length;
  const averageProgress = activeGoals.length ? Math.round(activeGoals.reduce((sum, goal) => sum + goal.progress.percentage, 0) / activeGoals.length) : 0;
  const nextGoal = [...activeGoals].sort((a, b) => a.target_date.localeCompare(b.target_date))[0];
  return (
    <main className="app-page">
      <PageHeader
        title="Metas"
        description="Defina o que você quer conquistar e acompanhe o caminho até lá."
        mobileDescription="Acompanhe o caminho das suas metas."
        actions={<Link href="/goals/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">Nova meta</Link>}
      />

      {data.hasError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Algumas fontes não puderam ser carregadas. Os valores disponíveis continuam visíveis.</div> : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold text-slate-500">Metas em andamento</p><p className="mt-2 text-2xl font-semibold text-slate-950">{activeGoals.length}</p><p className="mt-1 text-xs text-slate-500">{completed} concluída{completed === 1 ? "" : "s"}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold text-slate-500">Progresso médio</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{averageProgress}%</p><p className="mt-1 text-xs text-slate-500">considerando metas ativas</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold text-slate-500">Próximo prazo</p><p className="mt-2 text-lg font-semibold text-slate-950">{nextGoal ? formatIsoDatePtBr(nextGoal.target_date) : "—"}</p><p className="mt-1 truncate text-xs text-slate-500">{nextGoal?.name ?? "Cadastre uma meta para começar"}</p></article>
      </section>

      <section className="grid gap-4">
        <div className="grid gap-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-950">Suas metas</h2><span className="text-sm text-slate-500">{data.goals.length} cadastrada{data.goals.length === 1 ? "" : "s"}</span></div>
          {data.goals.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="text-lg font-bold text-slate-900">Comece pelo que importa</p><p className="mt-2 text-sm text-slate-600">Crie uma meta e acompanhe contribuições, prazo e fontes vinculadas.</p><Link href="/goals/new" className="mt-5 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Criar primeira meta</Link></div> : null}
          {data.goals.map((goal) => (
            <Link key={goal.id} href={`/goals/${goal.id}`} className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-slate-950">{goal.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(goal.status)}`}>{FINANCIAL_GOAL_STATUS_LABELS[goal.status]}</span></div><p className="mt-1 text-sm text-slate-500">{FINANCIAL_GOAL_TYPE_LABELS[goal.goal_type]} · prazo {formatIsoDatePtBr(goal.target_date)}</p></div><span className="text-2xl font-black text-emerald-700">{goal.progress.percentage}%</span></div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, goal.progress.percentage))}%` }} /></div>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="font-bold text-slate-900">{formatMoney(goal.accumulated_amount_minor, goal.currency)}</span><span className="text-slate-500">de {formatMoney(goal.target_amount_minor, goal.currency)}</span><span className="ml-auto text-xs text-slate-500">{goal.progress.monthlyContributionMinor ? `${formatMoney(goal.progress.monthlyContributionMinor, goal.currency)}/mês necessários` : "Meta alcançada"}</span></div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
