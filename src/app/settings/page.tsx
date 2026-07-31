import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentProfile } from "@/services/auth/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perfil" };

const sections = [
  {
    href: "/settings/profile",
    eyebrow: "Informações pessoais",
    title: "Perfil e preferências",
    description:
      "Atualize seu nome e a moeda preferida usada como referência visual.",
    action: "Abrir perfil",
  },
  {
    href: "/imports",
    eyebrow: "Importações",
    title: "Histórico e administração",
    description:
      "Revise arquivos, acompanhe importações concluídas e limpe itens cancelados.",
    action: "Ver importações",
  },
  {
    href: "/settings/security",
    eyebrow: "Segurança e dados",
    title: "Backup e privacidade",
    description:
      "Exporte seus dados, restaure um backup e acesse operações sensíveis.",
    action: "Abrir segurança",
  },
] as const;

export default async function SettingsPage() {
  const { user, profile } = await getCurrentProfile();
  const firstName = profile?.full_name.trim().split(/\s+/)[0] || "seu perfil";

  return (
    <AppShell>
      <main className="mx-auto grid max-w-6xl gap-7 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="rounded-3xl bg-gradient-to-br from-emerald-800 to-slate-950 p-6 text-white sm:p-8">
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-200">
            Central pessoal
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Olá, {firstName}.
          </h1>
          <p className="mt-3 max-w-2xl text-emerald-100">
            Informações pessoais, importações e controles de segurança reunidos
            em um único lugar.
          </p>
          <p className="mt-5 text-sm text-emerald-200">{user.email}</p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {sections.map((section) => (
            <article
              key={section.href}
              className="flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-emerald-700">
                {section.eyebrow}
              </p>
              <h2 className="mt-3 text-xl font-black text-slate-950">
                {section.title}
              </h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">
                {section.description}
              </p>
              <Link
                href={section.href}
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 font-bold text-slate-800 hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {section.action}
              </Link>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
