import "server-only";
import { buildIrpfMonths, classifyIrpfCategory, currentIrpfMonth, IRPF_MONTH_FIELDS, type IrpfEvent, type IrpfMonthProjection } from "@/domain/irpf-simulator";
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

  const [transactions, transfers, flows, categories, accounts, positions, projections] = await Promise.all([
    loadTransactions(), loadTransfers(), loadInvestmentFlows(),
    supabase.from("categories").select("id, name, kind, parent_id").eq("user_id", user.id),
    supabase.from("accounts").select("id, type, currency, tax_deductible_pension").eq("user_id", user.id),
    supabase.from("investment_positions").select("id, currency, tax_deductible_pension").eq("user_id", user.id).eq("investment_class", "pension"),
    supabase.from("irpf_monthly_projections")
      .select("month_date, salary_minor, vacation_minor, inss_minor, health_minor, health_reimbursement_minor, pension_minor, withheld_tax_minor")
      .eq("user_id", user.id).gte("month_date", firstDay).lt("month_date", nextYear).order("month_date"),
  ]);
  const hasError = Boolean(transactions.error || transfers.error || flows.error || categories.error || accounts.error || positions.error || projections.error);
  if (hasError) return { months: buildIrpfMonths(year, []), projections: [] as IrpfMonthProjection[], hasError: true, classifiedCount: 0 };

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
  return {
    months: buildIrpfMonths(year, events),
    projections: (projections.data ?? []).map((row): IrpfMonthProjection => ({
      month: row.month_date.slice(0, 7),
      salaryMinor: row.salary_minor === null ? null : coerceMinorUnits(row.salary_minor),
      vacationMinor: row.vacation_minor === null ? null : coerceMinorUnits(row.vacation_minor),
      inssMinor: row.inss_minor === null ? null : coerceMinorUnits(row.inss_minor),
      healthMinor: row.health_minor === null ? null : coerceMinorUnits(row.health_minor),
      healthReimbursementMinor: row.health_reimbursement_minor === null ? null : coerceMinorUnits(row.health_reimbursement_minor),
      pensionMinor: row.pension_minor === null ? null : coerceMinorUnits(row.pension_minor),
      withheldTaxMinor: row.withheld_tax_minor === null ? null : coerceMinorUnits(row.withheld_tax_minor),
    })),
    hasError: false,
    classifiedCount: events.length,
  };
}

export async function saveCurrentUserIrpfProjections(input: readonly IrpfMonthProjection[]) {
  const { supabase, user } = await requireUser();
  const current = currentIrpfMonth();
  if (input.length > 12 || input.some((row) => !/^2026-(0[1-9]|1[0-2])$/.test(row.month) || row.month < current)) {
    return false;
  }
  const rows = input.map((row) => {
    for (const field of IRPF_MONTH_FIELDS) {
      const value = row[field];
      if (value !== null && value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error("Projeção monetária inválida.");
      }
    }
    return {
      user_id: user.id, month_date: `${row.month}-01`,
      salary_minor: row.salaryMinor ?? null,
      vacation_minor: row.vacationMinor ?? null,
      inss_minor: row.inssMinor ?? null,
      health_minor: row.healthMinor ?? null,
      health_reimbursement_minor: row.healthReimbursementMinor ?? null,
      pension_minor: row.pensionMinor ?? null,
      withheld_tax_minor: row.withheldTaxMinor ?? null,
    };
  });
  if (!rows.length) return true;
  const { error } = await supabase.from("irpf_monthly_projections")
    .upsert(rows, { onConflict: "user_id,month_date" });
  return !error;
}
