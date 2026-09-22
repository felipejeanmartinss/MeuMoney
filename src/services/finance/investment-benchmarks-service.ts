import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import { coerceMinorUnits } from "@/domain/money";
import { benchmarkMonths, compareInvestmentBenchmarks } from "@/domain/investment-benchmarks";

export async function getInvestmentBenchmarks(input: { selection: string; from: string; to: string }) {
  const { supabase, user } = await requireUser();
  const months = benchmarkMonths(input.from, input.to);
  const previous = new Date(`${months[0]}T12:00:00Z`); previous.setUTCDate(0);
  const end = new Date(`${months.at(-1)}T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  const endDate = end.toISOString().slice(0, 10);
  const positionResult = await supabase.from("investment_positions").select("id,asset_name,investment_class,currency,history_is_complete,current_value_minor,position_date")
    .eq("user_id", user.id).order("asset_name");
  const positions = positionResult.data ?? [];
  const selected = positions.filter((row) => row.currency === "BRL" && (input.selection === `asset:${row.id}` || input.selection === `class:${row.investment_class}`));
  const ids = selected.map((row) => row.id);
  async function snapshots() {
    const rows: { position_id: string; position_date: string; current_value_minor: number }[] = [];
    if (!ids.length) return { rows, error: null };
    for (let offset = 0; ; offset += 1000) {
      const page = await supabase.from("investment_position_snapshots").select("position_id,position_date,current_value_minor")
        .eq("user_id", user.id).in("position_id", ids).gte("position_date", previous.toISOString().slice(0, 10)).lte("position_date", endDate)
        .order("position_date").order("id").range(offset, offset + 999);
      if (page.error) return { rows, error: page.error };
      rows.push(...page.data);
      if (page.data.length < 1000) return { rows, error: null };
    }
  }
  async function flows() {
    const rows: { position_id: string; cash_flow_date: string; amount_minor: number; cash_flow_type: string }[] = [];
    if (!ids.length) return { rows, error: null };
    for (let offset = 0; ; offset += 1000) {
      const page = await supabase.from("investment_cash_flows").select("position_id,cash_flow_date,amount_minor,cash_flow_type")
        .eq("user_id", user.id).in("position_id", ids).gte("cash_flow_date", months[0]).lte("cash_flow_date", endDate)
        .order("cash_flow_date").order("id").range(offset, offset + 999);
      if (page.error) return { rows, error: page.error };
      rows.push(...page.data);
      if (page.data.length < 1000) return { rows, error: null };
    }
  }
  async function benchmarks() {
    const rows: { code: string; reference_month: string; return_percent: number; source: string; synced_at: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await supabase.from("investment_benchmark_months").select("code,reference_month,return_percent,source,synced_at")
        .gte("reference_month", months[0]).lte("reference_month", months.at(-1)!).order("code").order("reference_month").range(offset, offset + 999);
      if (page.error) return { rows, error: page.error };
      rows.push(...page.data);
      if (page.data.length < 1000) return { rows, error: null };
    }
  }
  const [history, cash, references] = await Promise.all([snapshots(), flows(), benchmarks()]);
  return { positions, hasError: Boolean(positionResult.error || history.error || cash.error || references.error),
    latestSync: references.rows.map((row) => row.synced_at).sort().at(-1) ?? null,
    result: compareInvestmentBenchmarks({ months, positions: selected.map((row) => ({ id: row.id, name: row.asset_name, historyIsComplete: row.history_is_complete, currency: row.currency })),
      snapshots: [...history.rows.map((row) => ({ positionId: row.position_id, date: row.position_date, valueMinor: coerceMinorUnits(row.current_value_minor) })),
        ...selected.map((row) => ({ positionId: row.id, date: row.position_date, valueMinor: coerceMinorUnits(row.current_value_minor) }))],
      flows: cash.rows.map((row) => ({ positionId: row.position_id, date: row.cash_flow_date, amountMinor: coerceMinorUnits(row.amount_minor), type: row.cash_flow_type })), benchmarks: references.rows }) };
}
