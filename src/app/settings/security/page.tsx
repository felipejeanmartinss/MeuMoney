import { AccountDeletionForm } from "@/components/forms/account-deletion-form";
import { BackupRestoreForm } from "@/components/forms/backup-restore-form";
import { AppShell } from "@/components/layout/app-shell";
import { listCriticalOperations } from "@/services/security/personal-data-service";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Segurança e dados" };

const eventLabels = {
  data_exported: "Backup exportado",
  backup_restored: "Backup restaurado",
  account_deletion_requested: "Exclusão de conta solicitada",
  account_deletion_failed: "Exclusão de conta não concluída",
  import_confirmed: "Importação confirmada",
  import_cancelled: "Importação cancelada",
  import_retention_applied: "Retenção de importações aplicada",
} as const;

export default async function SecurityPage() {
  const { events, hasError } = await listCriticalOperations();

  return (
    <AppShell>
      <main className="mx-auto grid max-w-4xl gap-7 px-4 py-8 sm:px-6 sm:py-12">
        <header>
          <Link
            href="/settings"
            className="text-sm font-bold text-emerald-700 hover:underline"
          >
            ← Voltar para Perfil
          </Link>
          <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Segurança e dados
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Backup, privacidade e conta
          </h1>
          <p className="mt-2 text-slate-600">
            Exporte, restaure e controle a permanência dos seus dados.
          </p>
        </header>

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Backup completo</h2>
          <p className="text-slate-600">
            O arquivo inclui seus dados financeiros e deve ser guardado em
            local privado. Ele não contém sua senha.
          </p>
          <a
            href="/api/account/export"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800"
          >
            Baixar backup JSON
          </a>
        </section>

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Restaurar backup</h2>
          <p className="text-slate-600">
            A restauração substitui os dados atuais desta conta pelos dados do
            arquivo.
          </p>
          <BackupRestoreForm />
        </section>

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Histórico de operações críticas</h2>
          {hasError ? (
            <p role="alert" className="text-red-700">
              O histórico não pôde ser carregado.
            </p>
          ) : events.length === 0 ? (
            <p className="text-slate-600">Nenhuma operação registrada.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                >
                  <span className="font-semibold text-slate-900">
                    {eventLabels[event.event_type]}
                  </span>
                  <time className="text-slate-600" dateTime={event.created_at}>
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(event.created_at))}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-4 rounded-2xl border-2 border-red-200 bg-red-50/40 p-6 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-red-700">
            Zona sensível
          </p>
          <h2 className="text-xl font-bold text-red-800">Excluir conta</h2>
          <p className="text-slate-700">
            A exclusão é definitiva e remove autenticação, perfil e todos os
            registros associados. Exporte um backup antes de continuar.
          </p>
          <AccountDeletionForm />
        </section>
      </main>
    </AppShell>
  );
}
