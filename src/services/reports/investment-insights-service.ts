import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import { coerceMinorUnits } from "@/domain/money";
import { buildCreditCardExpenseReportRows } from "@/domain/credit-card-reports";
import type { SupportedCurrency } from "@/types/database";

export async function getInvestmentInsightData(currency: SupportedCurrency) {
  const { supabase, user } = await requireUser();
  const [positionsResult, snapshotsResult] = await Promise.all([
    supabase.from("investment_positions")
      .select("id,asset_name,investment_class,currency,quantity,current_value_minor,position_date,is_active,archived_at")
      .eq("user_id", user.id).eq("currency", currency).order("asset_name"),
    supabase.from("investment_position_snapshots")
      .select("position_id,position_date,quantity,current_value_minor")
      .eq("user_id", user.id).eq("currency", currency).order("position_date").limit(5000),
  ]);
  const positions = (positionsResult.data ?? []).map((row) => ({ ...row, current_value_minor: coerceMinorUnits(row.current_value_minor) }));
  const ids = new Set(positions.map((row) => row.id));
  const snapshots = (snapshotsResult.data ?? []).filter((row) => ids.has(row.position_id)).map((row) => ({ ...row, current_value_minor: coerceMinorUnits(row.current_value_minor) }));
  return { positions, snapshots, hasError: Boolean(positionsResult.error || snapshotsResult.error) };
}

export async function getCreditCardExpenseReport(currency: SupportedCurrency, cardId: string | null) {
  const { supabase, user } = await requireUser();
  const [cardsResult, purchasesResult, installmentsResult, paymentsResult] = await Promise.all([
    supabase.from("credit_cards").select("id,name,currency").eq("user_id", user.id).eq("currency", currency).order("name"),
    supabase.from("credit_card_purchases").select("id,credit_card_id,entry_kind,purchase_date,status").eq("user_id", user.id).limit(5000),
    supabase.from("credit_card_installments").select("purchase_id,credit_card_id,invoice_id,installment_number,amount,status").eq("user_id", user.id).limit(5000),
    supabase.from("credit_card_payments").select("credit_card_id,invoice_id,amount_minor,payment_date,state").eq("user_id", user.id).eq("state", "active").limit(5000),
  ]);
  const cards = cardsResult.data ?? [];
  const selected = new Set(cards.filter((card) => !cardId || card.id === cardId).map((card) => card.id));
  const rows = buildCreditCardExpenseReportRows({
    selectedCardIds: selected,
    purchases: purchasesResult.data ?? [],
    installments: installmentsResult.data ?? [],
    payments: paymentsResult.data ?? [],
  });
  return { cards, rows,
    hasError: Boolean(cardsResult.error || purchasesResult.error || installmentsResult.error || paymentsResult.error) };
}
