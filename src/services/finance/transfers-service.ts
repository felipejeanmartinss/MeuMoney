import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import type { TransactionStatus } from "@/types/database";

export type TransferMutationInput = {
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;
  destinationAmountMinor: number;
  transactionDate: string;
  status: TransactionStatus;
  description: string | null;
  notes: string | null;
};

export type CreditCardTransferMutationInput = Omit<
  TransferMutationInput,
  "destinationAccountId" | "destinationAmountMinor"
> & {
  destinationCreditCardId: string;
};

export type TransferFilters = {
  status?: TransactionStatus;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  activity: "active" | "inactive" | "all";
};

const transferColumns =
  "id, user_id, source_account_id, destination_account_id, destination_credit_card_id, amount_minor, currency, destination_amount_minor, destination_currency, transaction_date, status, description, notes, is_active, created_at, updated_at";

function transferErrorMessage(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("transfer_accounts_must_differ")) {
    return "Origem e destino devem ser diferentes.";
  }
  if (message.includes("transfer_currency_mismatch")) {
    return "Informe o valor exato que será recebido na moeda de destino.";
  }
  if (message.includes("same_currency_transfer_amount_mismatch")) {
    return "Entre contas da mesma moeda, os valores de saída e entrada devem ser iguais.";
  }
  if (message.includes("transfer_currency_conversion_amount_required")) {
    return "Informe o valor convertido que entrará na conta de destino.";
  }
  if (message.includes("invalid_transfer_account")) {
    return "Uma das contas não está disponível.";
  }
  if (message.includes("invalid_transfer_credit_card")) {
    return "O cartão não está disponível ou usa outra moeda.";
  }
  if (message.includes("linked_investment_transfer_is_immutable")) {
    return "Esta transferência já está vinculada a uma posição de investimento e não pode ser alterada.";
  }
  return "Não foi possível salvar a transferência.";
}

export async function listCurrentUserTransfers(filters: TransferFilters) {
  const { supabase, user } = await requireUser();
  let transferQuery = supabase
    .from("transfers")
    .select(transferColumns)
    .eq("user_id", user.id)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status) transferQuery = transferQuery.eq("status", filters.status);
  if (filters.accountId) {
    transferQuery = transferQuery.or(
      `source_account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`,
    );
  }
  if (filters.dateFrom) {
    transferQuery = transferQuery.gte("transaction_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    transferQuery = transferQuery.lte("transaction_date", filters.dateTo);
  }
  if (filters.activity !== "all") {
    transferQuery = transferQuery.eq(
      "is_active",
      filters.activity === "active",
    );
  }

  const [transfersResult, accountsResult, cardsResult] = await Promise.all([
    transferQuery,
    supabase
      .from("accounts")
      .select("id, name, currency, archived_at")
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("credit_cards")
      .select("id, name, currency, is_active")
      .eq("user_id", user.id)
      .order("name"),
  ]);

  return {
    transfers: transfersResult.data ?? [],
    accounts: accountsResult.data ?? [],
    creditCards: cardsResult.data ?? [],
    hasError: Boolean(
      transfersResult.error || accountsResult.error || cardsResult.error,
    ),
  };
}

export async function getTransferFormOptions() {
  const { supabase, user } = await requireUser();
  const [accountsResult, cardsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, currency, context")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("credit_card_summaries")
      .select("id, name, currency, current_balance_minor")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name"),
  ]);

  return {
    accounts: accountsResult.data ?? [],
    creditCards: (cardsResult.data ?? []).map((card) => ({
      id: card.id,
      cardName: card.name,
      currency: card.currency,
      currentBalanceMinor: Number(card.current_balance_minor),
    })),
    hasError: Boolean(accountsResult.error || cardsResult.error),
  };
}

export async function getCurrentUserTransfer(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transfers")
    .select(transferColumns)
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return { transfer: data, hasError: Boolean(error) };
}

export async function createCurrentUserTransfer(input: TransferMutationInput) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_account_transfer", {
    source_account_id: input.sourceAccountId,
    destination_account_id: input.destinationAccountId,
    source_amount_minor: input.amountMinor,
    destination_amount_minor: input.destinationAmountMinor,
    transaction_date: input.transactionDate,
    transfer_status: input.status,
    transfer_description: input.description,
    transfer_notes: input.notes,
  });

  return error
    ? { ok: false as const, message: transferErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserTransfer(
  id: string,
  input: TransferMutationInput,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_account_transfer", {
    target_transfer_id: id,
    source_account_id: input.sourceAccountId,
    destination_account_id: input.destinationAccountId,
    source_amount_minor: input.amountMinor,
    destination_amount_minor: input.destinationAmountMinor,
    transaction_date: input.transactionDate,
    transfer_status: input.status,
    transfer_description: input.description,
    transfer_notes: input.notes,
  });

  return error
    ? { ok: false as const, message: transferErrorMessage(error) }
    : { ok: true as const };
}

export async function createCurrentUserCreditCardTransfer(
  input: CreditCardTransferMutationInput,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_credit_card_transfer", {
    source_account_id: input.sourceAccountId,
    destination_credit_card_id: input.destinationCreditCardId,
    amount_minor: input.amountMinor,
    transaction_date: input.transactionDate,
    transfer_status: input.status,
    transfer_description: input.description,
    transfer_notes: input.notes,
  });

  return error
    ? { ok: false as const, message: transferErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserCreditCardTransfer(
  id: string,
  input: CreditCardTransferMutationInput,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_credit_card_transfer", {
    target_transfer_id: id,
    source_account_id: input.sourceAccountId,
    destination_credit_card_id: input.destinationCreditCardId,
    amount_minor: input.amountMinor,
    transaction_date: input.transactionDate,
    transfer_status: input.status,
    transfer_description: input.description,
    transfer_notes: input.notes,
  });

  return error
    ? { ok: false as const, message: transferErrorMessage(error) }
    : { ok: true as const };
}

export async function setCurrentUserTransferActive(
  id: string,
  active: boolean,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_transfer_active", {
    target_transfer_id: id,
    active,
  });

  return error
    ? {
        ok: false as const,
        message: error.message
          .toLowerCase()
          .includes("linked_investment_transfer_is_immutable")
          ? "Esta transferência já está vinculada a uma posição de investimento e não pode ser excluída."
          : "Não foi possível alterar o status da transferência.",
      }
    : { ok: true as const };
}

export async function deleteCurrentUserTransfer(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transfers")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  const message = error?.message?.toLowerCase() ?? "";
  if (
    message.includes("investment_cash_flows") ||
    message.includes("linked_investment_transfer")
  ) {
    return {
      ok: false as const,
      message:
        "Exclua primeiro o vínculo com a posição de investimento; depois a transferência poderá ser excluída.",
    };
  }
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível excluir a transferência.",
      }
    : { ok: true as const };
}
