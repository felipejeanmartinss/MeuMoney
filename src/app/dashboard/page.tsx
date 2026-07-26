import Link from "next/link";
import { getCurrentProfile } from "@/services/auth/server-auth";

export const metadata = { title: "Início" };

export default async function DashboardPage() {
  const { user, profile } = await getCurrentProfile();
  const firstName = profile?.full_name?.split(" ")[0] || "bem-vindo";
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 to-indigo-950 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-10">
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-blue-200">
          Organização financeira
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          Olá, {firstName}.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100 sm:text-lg">
          Registre receitas, despesas e transferências para manter o saldo das
          suas contas sempre coerente.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/transactions"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
        >
          <p className="text-sm font-bold uppercase tracking-wider text-blue-700">
            Lançamentos
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-950">
            Registre seu fluxo financeiro
          </h2>
          <p className="mt-2 leading-6 text-slate-600">
            Organize receitas e despesas previstas ou realizadas e encontre
            movimentações com filtros.
          </p>
          <span className="mt-5 inline-flex font-semibold text-blue-700 group-hover:underline">
            Acessar lançamentos →
          </span>
        </Link>

        <Link
          href="/transfers"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
        >
          <p className="text-sm font-bold uppercase tracking-wider text-blue-700">
            Transferências
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-950">
            Mova valores entre contas
          </h2>
          <p className="mt-2 leading-6 text-slate-600">
            Registre os dois lados da movimentação de forma atômica, sem
            classificar como receita ou despesa.
          </p>
          <span className="mt-5 inline-flex font-semibold text-blue-700 group-hover:underline">
            Acessar transferências →
          </span>
        </Link>

        <Link
          href="/accounts"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
        >
          <p className="text-sm font-bold uppercase tracking-wider text-blue-700">
            Contas
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-950">
            Organize onde está seu dinheiro
          </h2>
          <p className="mt-2 leading-6 text-slate-600">
            Cadastre contas, informe o saldo inicial e diferencie o uso pessoal
            do profissional.
          </p>
          <span className="mt-5 inline-flex font-semibold text-blue-700 group-hover:underline">
            Acessar contas →
          </span>
        </Link>

        <Link
          href="/categories"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
        >
          <p className="text-sm font-bold uppercase tracking-wider text-blue-700">
            Categorias
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-slate-950">
            Prepare sua classificação
          </h2>
          <p className="mt-2 leading-6 text-slate-600">
            Consulte categorias padrão de receitas e despesas e crie categorias
            personalizadas.
          </p>
          <span className="mt-5 inline-flex font-semibold text-blue-700 group-hover:underline">
            Acessar categorias →
          </span>
        </Link>
      </section>

      <section className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Seu acesso</h2>
          <dl className="mt-5 grid gap-4">
            <div>
              <dt className="text-sm font-medium text-slate-500">Nome</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {profile?.full_name || "Nome não informado"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-slate-500">E-mail</dt>
              <dd className="mt-1 break-all font-semibold text-slate-900">
                {user.email}
              </dd>
            </div>
          </dl>
          <Link
            href="/settings/profile"
            className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Editar perfil e moeda
          </Link>
        </article>
        <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="font-bold">Próximas etapas</h2>
          <p className="mt-2 leading-6">
            Cartões, faturas, parcelamentos, recorrências, orçamentos,
            investimentos e indicadores avançados permanecem reservados às
            próximas sprints.
          </p>
        </aside>
      </section>
    </main>
  );
}
