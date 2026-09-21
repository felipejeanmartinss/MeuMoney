import "server-only";

import { requireUser } from "@/services/auth/server-auth";
import { currentIsoDate } from "@/utils/dates";

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type DataQualityCheck = {
  id: string;
  title: string;
  description: string;
  count: number;
  href: string;
  tone: "attention" | "info" | "ok";
};

export async function getCurrentUserDataQuality() {
  const { supabase, user } = await requireUser();
  const today = currentIsoDate();
  const staleDate = addDays(today, -30);

  const [unclassified, pendingImports, staleAccounts, staleQuotes, unreconciledTransfers, inconsistentInvoices, incompletePositions] = await Promise.all([
    supabase.from("transactions").select("id").eq("user_id", user.id).eq("is_active", true).is("category_id", null),
    supabase.from("import_jobs").select("id").eq("user_id", user.id).in("status", ["review", "failed"]),
    supabase.from("account_balances").select("id").eq("user_id", user.id).is("archived_at", null).lt("updated_at", `${staleDate}T00:00:00Z`),
    supabase.from("investment_position_summary").select("id").eq("user_id", user.id).eq("is_active", true).lt("position_date", staleDate),
    supabase.from("transfer_entries").select("id").eq("user_id", user.id).eq("is_active", true).is("reconciled_at", null),
    supabase.from("financial_dashboard_invoices").select("id, total_amount_minor, outstanding_amount_minor").eq("user_id", user.id).in("effective_status", ["open", "closed", "overdue"]),
    supabase.from("investment_position_summary").select("id").eq("user_id", user.id).eq("is_active", true).eq("history_is_complete", false),
  ]);

  const inconsistentInvoiceCount = (inconsistentInvoices.data ?? []).filter((invoice) =>
    Number(invoice.total_amount_minor) < 0 || Number(invoice.outstanding_amount_minor) < 0,
  ).length;
  const checks: DataQualityCheck[] = [
    { id: "unclassified", title: "Lançamentos sem categoria", description: "Classifique as movimentações para manter relatórios e orçamento confiáveis.", count: unclassified.data?.length ?? 0, href: "/transactions", tone: "attention" },
    { id: "imports", title: "Importações para revisar", description: "Há arquivos com linhas pendentes ou falhas de leitura.", count: pendingImports.data?.length ?? 0, href: "/imports", tone: "attention" },
    { id: "accounts", title: "Saldos sem atualização", description: "Contas sem atualização há mais de 30 dias.", count: staleAccounts.data?.length ?? 0, href: "/accounts", tone: "info" },
    { id: "quotes", title: "Cotações antigas", description: "Posições sem uma fotografia recente.", count: staleQuotes.data?.length ?? 0, href: "/investments/prices", tone: "info" },
    { id: "transfers", title: "Transferências não reconciliadas", description: "Confira as movimentações entre contas.", count: unreconciledTransfers.data?.length ?? 0, href: "/accounts", tone: "attention" },
    { id: "invoices", title: "Faturas inconsistentes", description: "Valores negativos ou saldos que precisam de conferência.", count: inconsistentInvoiceCount, href: "/credit-cards", tone: "attention" },
    { id: "positions", title: "Histórico de investimentos incompleto", description: "Posições sem histórico completo têm retorno estimado.", count: incompletePositions.data?.length ?? 0, href: "/investments", tone: "info" },
  ];
  return {
    checks,
    attentionCount: checks.filter((check) => check.count > 0).length,
    hasError: Boolean(unclassified.error || pendingImports.error || staleAccounts.error || staleQuotes.error || unreconciledTransfers.error || inconsistentInvoices.error || incompletePositions.error),
  };
}
