import "server-only";
import {
  buildAccountRegister,
  summarizeAccountRegisterBalances,
  type AccountRegisterSourceEntry,
} from "@/domain/account-register";
import { getCategoryQualifiedName } from "@/domain/categories";
import { requireUser } from "@/services/auth/server-auth";
import type {
  AccountType,
  Category,
  CategoryGroup,
  FinancialContext,
  SupportedCurrency,
  Transaction,
  Transfer,
  TransferEntry,
} from "@/types/database";
import { currentIsoDate } from "@/utils/dates";

export type AccountMutationInput = {
  name: string;
  type: Extract<
    AccountType,
    "checking" | "savings" | "investment" | "cash" | "other"
  >;
  context: FinancialContext;
  currency: SupportedCurrency;
  openingBalanceMinor: number;
  openingBalanceDate: string;
};

export async function listCurrentUserAccounts() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("account_balances")
    .select("id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at, created_at, updated_at, current_balance_minor")
    .eq("user_id", user.id)
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  return { accounts: data ?? [], hasError: Boolean(error) };
}

export async function getCurrentUserAccount(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return { account: data, hasError: Boolean(error) };
}

export async function getCurrentUserAccountHub(id: string) {
  const { supabase, user } = await requireUser();

  async function getAllAccountTransactions() {
    const rows: Transaction[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, user_id, account_id, category_id, transaction_type, description, amount_minor, transaction_date, status, notes, is_active, reconciled_at, origin_type, origin_id, credit_card_invoice_id, recurring_transaction_id, created_at, updated_at",
        )
        .eq("user_id", user.id)
        .eq("account_id", id)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) return { data: rows, error };
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) return { data: rows, error: null };
    }
  }

  async function getAllAccountTransferEntries() {
    const rows: TransferEntry[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("transfer_entries")
        .select(
          "id, transfer_id, user_id, account_id, direction, amount_minor, currency, transaction_date, status, is_active, reconciled_at, created_at, updated_at",
        )
        .eq("user_id", user.id)
        .eq("account_id", id)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) return { data: rows, error };
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) return { data: rows, error: null };
    }
  }

  const [
    accountResult,
    transactionsResult,
    transferEntriesResult,
    transfersResult,
    accountsResult,
    creditCardsResult,
    recurrencesResult,
    importsResult,
    categoriesResult,
    categoryGroupsResult,
    investmentLinksResult,
  ] = await Promise.all([
    supabase
      .from("account_balances")
      .select(
        "id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at, created_at, updated_at, current_balance_minor",
      )
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle(),
    getAllAccountTransactions(),
    getAllAccountTransferEntries(),
    supabase
      .from("transfers")
      .select(
        "id, user_id, source_account_id, destination_account_id, destination_credit_card_id, amount_minor, currency, transaction_date, status, description, notes, is_active, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .or(`source_account_id.eq.${id},destination_account_id.eq.${id}`),
    supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", user.id),
    supabase
      .from("credit_cards")
      .select("id, name")
      .eq("user_id", user.id),
    supabase
      .from("recurring_transactions")
      .select(
        "id, user_id, account_id, category_id, transaction_type, description, amount_minor, frequency, start_date, end_date, next_occurrence, notes, is_active, ended_at, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .eq("account_id", id)
      .is("ended_at", null)
      .order("next_occurrence")
      .limit(50),
    supabase
      .from("import_jobs")
      .select(
        "id, user_id, account_id, file_name, file_type, source_adapter_id, source_document_type, status, source_row_count, valid_row_count, duplicate_row_count, imported_row_count, original_file_discarded_at, confirmed_at, cancelled_at, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("categories")
      .select(
        "id, user_id, group_id, parent_id, name, kind, context, is_system, archived_at, created_at, updated_at",
      )
      .eq("user_id", user.id),
    supabase
      .from("category_groups")
      .select("id, user_id, name, kind, context, is_system, archived_at, created_at, updated_at")
      .eq("user_id", user.id),
    supabase
      .from("investment_cash_flows")
      .select(
        "position_id, source_transfer_id, source_account_id",
      )
      .eq("user_id", user.id)
      .eq("source_account_id", id),
  ]);

  const categories = (categoriesResult.data ?? []) as Category[];
  const categoryGroups = (categoryGroupsResult.data ?? []) as CategoryGroup[];
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const accountById = new Map(
    (accountsResult.data ?? []).map((account) => [account.id, account.name]),
  );
  const transferById = new Map(
    ((transfersResult.data ?? []) as Transfer[]).map((transfer) => [
      transfer.id,
      transfer,
    ]),
  );
  const creditCardById = new Map(
    (creditCardsResult.data ?? []).map((card) => [card.id, card.name]),
  );
  const investmentLinkByTransfer = new Map(
    (investmentLinksResult.data ?? []).flatMap((flow) =>
      flow.source_transfer_id && flow.source_account_id
        ? [[`${flow.source_transfer_id}:${flow.source_account_id}`, flow.position_id] as const]
        : [],
    ),
  );
  const registerSource: AccountRegisterSourceEntry[] = [
    ...transactionsResult.data.map((transaction) => {
      const category = transaction.category_id
        ? categoryById.get(transaction.category_id)
        : undefined;
      return {
        id: transaction.id,
        entryType: "transaction" as const,
        transferId: null,
        transactionDate: transaction.transaction_date,
        createdAt: transaction.created_at,
        description: transaction.description,
        detail: category
          ? getCategoryQualifiedName(category, categories, categoryGroups)
          : transaction.origin_type === "credit_card_invoice_payment"
            ? "Pagamento técnico de fatura"
            : transaction.origin_type === "investment"
              ? "Movimento de investimento"
            : transaction.transaction_type === "income"
              ? "Receita"
              : "Despesa",
        status: transaction.status,
        isActive: transaction.is_active,
        reconciledAt: transaction.reconciled_at,
        direction: transaction.transaction_type,
        amountMinor: transaction.amount_minor,
        editHref:
          transaction.origin_type === "manual"
            ? `/transactions/${transaction.id}/edit`
            : null,
        investmentPositionId:
          transaction.origin_type === "investment"
            ? transaction.origin_id
            : null,
      };
    }),
    ...transferEntriesResult.data.map((entry) => {
      const transfer = transferById.get(entry.transfer_id);
      const counterpartId =
        entry.direction === "outflow"
          ? transfer?.destination_account_id
          : transfer?.source_account_id;
      const counterpartName = counterpartId
        ? accountById.get(counterpartId)
        : transfer?.destination_credit_card_id
          ? creditCardById.get(transfer.destination_credit_card_id)
          : undefined;
      const movement =
        entry.direction === "outflow"
          ? `Transferência para ${counterpartName ?? "outro destino"}`
          : `Transferência de ${counterpartName ?? "outra conta"}`;
      return {
        id: entry.id,
        entryType: "transfer_entry" as const,
        transferId: entry.transfer_id,
        transactionDate: entry.transaction_date,
        createdAt: entry.created_at,
        description: transfer?.description || movement,
        detail: movement,
        status: entry.status,
        isActive: entry.is_active,
        reconciledAt: entry.reconciled_at,
        direction: entry.direction,
        amountMinor: entry.amount_minor,
        editHref: `/transfers/${entry.transfer_id}/edit`,
        investmentPositionId:
          investmentLinkByTransfer.get(`${entry.transfer_id}:${id}`) ?? null,
      };
    }),
  ];
  const asOfDate = currentIsoDate();
  const openingBalanceMinor = accountResult.data?.opening_balance_minor ?? 0;
  const registerEntries = buildAccountRegister(
    registerSource,
    openingBalanceMinor,
    asOfDate,
  );
  const balanceSummary = summarizeAccountRegisterBalances(
    registerSource,
    openingBalanceMinor,
    asOfDate,
  );

  return {
    account: accountResult.data,
    registerEntries,
    balanceSummary,
    recurrences: recurrencesResult.data ?? [],
    imports: importsResult.data ?? [],
    categories,
    hasError: Boolean(
      accountResult.error ||
        transactionsResult.error ||
        transferEntriesResult.error ||
        transfersResult.error ||
        accountsResult.error ||
        creditCardsResult.error ||
        recurrencesResult.error ||
      importsResult.error ||
      categoriesResult.error ||
      categoryGroupsResult.error ||
      investmentLinksResult.error,
    ),
  };
}

export async function createCurrentUserAccount(input: AccountMutationInput) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name: input.name,
    type: input.type,
    context: input.context,
    currency: input.currency,
    opening_balance_minor: input.openingBalanceMinor,
    opening_balance_date: input.openingBalanceDate,
  });

  return error
    ? { ok: false as const, message: "Não foi possível cadastrar a conta." }
    : { ok: true as const };
}

export async function updateCurrentUserAccount(id: string, input: AccountMutationInput) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("accounts")
    .update({
      name: input.name,
      type: input.type,
      context: input.context,
      currency: input.currency,
      opening_balance_minor: input.openingBalanceMinor,
      opening_balance_date: input.openingBalanceDate,
    })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  return error || !data
    ? { ok: false as const, message: "Não foi possível atualizar a conta." }
    : { ok: true as const };
}

export async function setCurrentUserAccountArchived(id: string, archived: boolean) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("accounts")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  return error || !data
    ? { ok: false as const, message: "Não foi possível alterar o status da conta." }
    : { ok: true as const };
}

export async function deleteCurrentUserArchivedAccount(id: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("delete_archived_account", {
    target_account_id: id,
  });

  if (error?.message.includes("account_must_be_archived")) {
    return {
      ok: false as const,
      message: "Inative a conta antes de excluí-la definitivamente.",
    };
  }
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível excluir a conta definitivamente.",
      }
    : { ok: true as const };
}
