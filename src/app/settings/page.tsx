import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
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
      "Revise arquivos e gerencie o histórico de importações.",
    action: "Ver importações",
  },
  {
    href: "/data-quality",
    eyebrow: "Qualidade dos dados",
    title: "Revisar pendências",
    description: "Confira classificações, reconciliações e dados desatualizados.",
    action: "Revisar dados",
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
  const { user } = await getCurrentProfile();

  return (
    <AppShell>
      <main className="app-page max-w-6xl">
        <PageHeader title="Perfil" description={user.email} />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sections.map((section) => (
            <article
              key={section.href}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-emerald-700">
                {section.eyebrow}
              </p>
              <h2 className="mt-2 text-base font-semibold text-slate-950">
                {section.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                {section.description}
              </p>
              <Link
                href={section.href}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 font-bold text-slate-800 hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"
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
