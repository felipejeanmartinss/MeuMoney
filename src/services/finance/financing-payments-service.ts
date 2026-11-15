import "server-only";
import type { Database } from "@/types/database";
import { requireUser } from "@/services/auth/server-auth";
import { coerceMinorUnits } from "@/domain/money";
import type { FinancingTransactionOption } from "@/types/financing";

export async function getFinancingPaymentOptions(currency?: string) {
  const { supabase, user } = await requireUser();
  const accounts = await supabase.from("accounts").select("id,name,currency").eq("user_id", user.id);
  const currencies = new Map((accounts.data ?? []).map((row) => [row.id, row]));
  const transactions: FinancingTransactionOption[] = [];
  const used = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("financing_schedule_entries")
      .select("linked_transaction_id").eq("user_id", user.id).not("linked_transaction_id", "is", null)
      .order("id").range(from, from + 999);
    if (error) return { transactions: [], hasError: true };
    for (const row of data ?? []) if (row.linked_transaction_id) used.add(row.linked_transaction_id);
    if ((data?.length ?? 0) < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const page = await supabase.from("transactions").select("id,account_id,description,transaction_date,amount_minor")
      .eq("user_id", user.id).eq("is_active", true).eq("status", "completed").eq("transaction_type", "expense")
      .in("origin_type", ["manual", "system"]).is("credit_card_invoice_id", null)
      .order("transaction_date", { ascending: false }).order("id").range(from, from + 999);
    if (page.error || accounts.error) return { transactions: [], hasError: true };
    for (const row of page.data ?? []) {
      const account = currencies.get(row.account_id);
      if (!used.has(row.id) && account && (!currency || currency === account.currency)) transactions.push({ ...row, amount_minor: coerceMinorUnits(row.amount_minor), currency: account.currency, account_name: account.name });
    }
    if ((page.data?.length ?? 0) < 1000) break;
  }
  return { transactions, hasError: false };
}

export async function reconcileInstallment(args: Database["public"]["Functions"]["reconcile_financing_installment"]["Args"]) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("reconcile_financing_installment", args);
  return !error;
}
