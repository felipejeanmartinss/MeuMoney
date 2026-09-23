import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import { coerceMinorUnits } from "@/domain/money";
import type { FinancingTransactionOption } from "@/types/financing";

export async function getFinancingPaymentOptions(currency?: string) {
  const { supabase, user } = await requireUser();
  const accounts = await supabase.from("accounts").select("id,currency").eq("user_id", user.id);
  const currencies = new Map((accounts.data ?? []).map((row) => [row.id, row.currency]));
  const transactions: FinancingTransactionOption[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await supabase.from("transactions").select("id,account_id,description,transaction_date,amount_minor")
      .eq("user_id", user.id).eq("is_active", true).eq("status", "completed").eq("transaction_type", "expense")
      .order("transaction_date", { ascending: false }).order("id").range(from, from + 999);
    if (page.error || accounts.error) return { transactions: [], hasError: true };
    for (const row of page.data ?? []) {
      const rowCurrency = currencies.get(row.account_id);
      if (rowCurrency && (!currency || currency === rowCurrency)) transactions.push({ ...row, amount_minor: coerceMinorUnits(row.amount_minor), currency: rowCurrency });
    }
    if ((page.data?.length ?? 0) < 1000) break;
  }
  return { transactions, hasError: false };
}
