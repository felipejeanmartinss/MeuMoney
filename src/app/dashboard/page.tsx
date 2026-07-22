import Link from "next/link";
import { getCurrentProfile } from "@/services/auth/server-auth";

export const metadata = { title: "Área segura" };

export default async function DashboardPage() {
  const { user, profile } = await getCurrentProfile();
  const firstName = profile?.full_name?.split(" ")[0] || "bem-vindo";
  return <main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 sm:py-14">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 to-indigo-950 p-6 text-white shadow-xl shadow-blue-950/10 sm:p-10">
      <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-blue-200">Acesso protegido</p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Olá, {firstName}.</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100 sm:text-lg">Sua sessão foi validada com segurança. Esta é a área privada inicial do MeuMoney.</p>
    </section>
    <section className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Sua conta</h2>
        <dl className="mt-5 grid gap-4"><div><dt className="text-sm font-medium text-slate-500">Nome</dt><dd className="mt-1 font-semibold text-slate-900">{profile?.full_name || "Nome não informado"}</dd></div><div><dt className="text-sm font-medium text-slate-500">E-mail</dt><dd className="mt-1 break-all font-semibold text-slate-900">{user.email}</dd></div></dl>
        <Link href="/settings/profile" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800">Editar perfil</Link>
      </article>
      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><h2 className="font-bold">Próximas etapas</h2><p className="mt-2 leading-6">Os módulos financeiros serão implementados nas próximas sprints. Nenhum saldo, lançamento ou dado simulado é exibido nesta etapa.</p></aside>
    </section>
  </main>;
}
