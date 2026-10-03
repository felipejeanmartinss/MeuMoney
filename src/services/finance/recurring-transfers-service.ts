import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import type { RecurrenceFrequency, RecurringTransactionState } from "@/types/database";

export type RecurringTransferInput = {
  sourceAccountId: string;
  destinationAccountId: string;
  description: string;
  amountMinor: number;
  destinationAmountMinor: number;
  frequency: RecurrenceFrequency;
  startDate: string;
  nextOccurrence: string;
  endDate: string | null;
  notes: string | null;
};

export async function listCurrentUserRecurringTransfers() {
  const { supabase, user } = await requireUser();
  const result = await supabase.from("recurring_transfers").select("*")
    .eq("user_id", user.id).is("ended_at", null)
    .order("is_active", { ascending: false }).order("next_occurrence");
  return { transfers: result.data ?? [], hasError: Boolean(result.error) };
}

export async function getCurrentUserRecurringTransfer(id: string) {
  const { supabase, user } = await requireUser();
  const result = await supabase.from("recurring_transfers").select("*")
    .eq("user_id", user.id).eq("id", id).maybeSingle();
  return { transfer: result.data, hasError: Boolean(result.error) };
}

async function validateAccounts(input: RecurringTransferInput) {
  const { supabase, user } = await requireUser();
  const result = await supabase.from("accounts").select("id,currency")
    .eq("user_id", user.id).is("archived_at", null)
    .in("id", [input.sourceAccountId, input.destinationAccountId]);
  if (result.error || result.data?.length !== 2) return false;
  const [source, destination] = [
    result.data.find((item) => item.id === input.sourceAccountId),
    result.data.find((item) => item.id === input.destinationAccountId),
  ];
  return Boolean(source && destination &&
    (source.currency !== destination.currency || input.amountMinor === input.destinationAmountMinor));
}

function values(input: RecurringTransferInput) {
  return {
    source_account_id: input.sourceAccountId,
    destination_account_id: input.destinationAccountId,
    description: input.description,
    amount_minor: input.amountMinor,
    destination_amount_minor: input.destinationAmountMinor,
    frequency: input.frequency,
    start_date: input.startDate,
    next_occurrence: input.nextOccurrence,
    end_date: input.endDate,
    notes: input.notes,
  };
}

export async function saveCurrentUserRecurringTransfer(input: RecurringTransferInput, id?: string) {
  if (!(await validateAccounts(input))) return {
    ok: false as const, message: "Escolha duas contas ativas; na mesma moeda, entrada e saída devem coincidir.",
  };
  const { supabase, user } = await requireUser();
  const result = id
    ? await supabase.from("recurring_transfers").update({ ...values(input), updated_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", user.id).is("ended_at", null).select("id").maybeSingle()
    : await supabase.from("recurring_transfers").insert({ ...values(input), user_id: user.id })
        .select("id").maybeSingle();
  return result.error || !result.data
    ? { ok: false as const, message: "Não foi possível salvar a transferência recorrente." }
    : { ok: true as const };
}

export async function setCurrentUserRecurringTransferState(id: string, state: RecurringTransactionState) {
  const { supabase, user } = await requireUser();
  const result = await supabase.from("recurring_transfers").update({
    is_active: state === "active",
    ended_at: state === "ended" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id).is("ended_at", null).select("id").maybeSingle();
  return result.error || !result.data
    ? { ok: false as const, message: "Não foi possível alterar a recorrência." }
    : { ok: true as const };
}

export async function generateCurrentUserSingleRecurringTransfer(
  id: string, date: string, amountMinor: number, destinationAmountMinor: number,
) {
  const { supabase } = await requireUser();
  const result = await supabase.rpc("generate_one_recurring_transfer", {
    target_recurring_id: id,
    target_transaction_date: date,
    target_amount_minor: amountMinor,
    target_destination_amount_minor: destinationAmountMinor,
  });
  return result.error
    ? { ok: false as const, message: "Não foi possível gerar esta transferência prevista." }
    : { ok: true as const };
}
