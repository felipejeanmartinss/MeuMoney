import "server-only";
import { buildIrpfMonths, classifyIrpfCategory, type IrpfEvent } from "@/domain/irpf-simulator";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";

export async function getCurrentUserIrpfSimulation(year: 2026) {
  const { supabase, user } = await requireUser();
  const firstDay = `${year}-01-01`;
  const nextYear = `${year + 1}-01-01`;
  const pageSize = 1000;

  async function loadTransactions() {
    const rows: { id: string; account_id: string; category_id: string | null; transaction_type: "income" | "expense" | "transfer"; amount_minor: number; transaction_date: string }[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await supabase.from("transactions")
        .select("id, account_id, category_id, transaction_type, amount_minor, transaction_date")
        .eq("user_id", user.id).eq("status", "completed").eq("is_active", true)
        .gte("transaction_date", firstDay).lt("transaction_date", nextYear)
        .order("transaction_date").order("id").range(offset, offset + pageSize - 1);
      if (page.error) return { rows, error: page.error };
      rows.push(...page.data);
      if (page.data.length < pageSize) return { rows, error: null };
    }
  }
  async function loadTransfers() {
    const rows: { id: string; destination_account_id: string | null; amount_minor: number; transaction_date: string }[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await supabase.from("transfers")
        .select("id, destination_account_id, amount_minor, transaction_date")
        .eq("user_id", user.id).eq("currency", "BRL").eq("status", "completed").eq("is_active", true)
        .gte("transaction_date", firstDay).lt("transaction_date", nextYear)
        .order("transaction_date").order("id").range(offset, offset + pageSize - 1);
      if (page.error) return { rows, error: page.error };
      rows.push(...page.data);
      if (page.data.length < pageSize) return { rows, error: null };
    }
  }
  async function loadInvestmentFlows() {
    const rows: { id: string; position_id: string; source_transfer_id: string | null; amount_minor: number; cash_flow_date: string }[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await supabase.from("investment_cash_flows")
        .select("id, position_id, source_transfer_id, amount_minor, cash_flow_date")
        .eq("user_id", user.id).eq("cash_flow_type", "contribution")
        .gte("cash_flow_date", firstDay).lt("cash_flow_date", nextYear)
        .order("cash_flow_date").order("id").range(offset, offset + pageSize - 1);
      if (page.error) return { rows, error: page.error };
      rows.push(...page.data);
      if (page.data.length < pageSize) return { rows, error: null };
    }
  }

  const [transactions, transfers, flows, categories, accounts, positions] = await Promise.all([
    loadTransactions(), loadTransfers(), loadInvestmentFlows(),
    supabase.from("categories").select("id, name, kind, parent_id").eq("user_id", user.id),
    supabase.from("accounts").select("id, type, currency, tax_deductible_pension").eq("user_id", user.id),
    supabase.from("investment_positions").select("id, currency, tax_deductible_pension").eq("user_id", user.id).eq("investment_class", "pension"),
  ]);
  const hasError = Boolean(transactions.error || transfers.error || flows.error || categories.error || accounts.error || positions.error);
  if (hasError) return { months: buildIrpfMonths(year, []), hasError: true, classifiedCount: 0 };

  const categoryById = new Map((categories.data ?? []).map((category) => [category.id, category]));
  const brlAccounts = new Set((accounts.data ?? []).filter((account) => account.currency === "BRL").map((account) => account.id));
  const deductibleAccounts = new Set((accounts.data ?? []).filter((account) => account.type === "investment" && account.currency === "BRL" && account.tax_deductible_pension).map((account) => account.id));
  const deductiblePositions = new Set((positions.data ?? []).filter((position) => position.tax_deductible_pension && position.currency === "BRL").map((position) => position.id));
  const events: IrpfEvent[] = [];
  for (const transaction of transactions.rows) {
    if (!brlAccounts.has(transaction.account_id)) continue;
    const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
    if (!category || (transaction.transaction_type !== "income" && transaction.transaction_type !== "expense")) continue;
    const parent = category.parent_id ? categoryById.get(category.parent_id) : null;
    const kind = classifyIrpfCategory(transaction.transaction_type, category.name, parent?.name);
    if (kind) events.push({ id: `transaction:${transaction.id}`, date: transaction.transaction_date, kind, amountMinor: coerceMinorUnits(transaction.amount_minor) });
  }
  const countedTransfers = new Set<string>();
  for (const transfer of transfers.rows) {
    if (!transfer.destination_account_id || !deductibleAccounts.has(transfer.destination_account_id)) continue;
    countedTransfers.add(transfer.id);
    events.push({ id: `transfer:${transfer.id}`, date: transfer.transaction_date, kind: "pension", amountMinor: coerceMinorUnits(transfer.amount_minor) });
  }
  for (const flow of flows.rows) {
    if (!deductiblePositions.has(flow.position_id) || (flow.source_transfer_id && countedTransfers.has(flow.source_transfer_id))) continue;
    events.push({ id: `flow:${flow.id}`, date: flow.cash_flow_date, kind: "pension", amountMinor: coerceMinorUnits(flow.amount_minor) });
  }
  return { months: buildIrpfMonths(year, events), hasError: false, classifiedCount: events.length };
}
