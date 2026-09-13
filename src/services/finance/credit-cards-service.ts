import "server-only";
import { calculateCreditCardCommitment } from "@/domain/credit-cards";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import type {
  CreditCardBrand,
  CreditCardInstallment,
  CreditCardInvoice,
  CreditCardPurchase,
  CreditCardSummary,
  SupportedCurrency,
} from "@/types/database";
import type { CreditCardTransferDestination } from "@/domain/transfers";

export type CreditCardMutationInput = {
  name: string;
  issuer: string;
  brand: CreditCardBrand;
  lastFourDigits: string;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
  currency: SupportedCurrency;
  linkedAccountId: string | null;
};

export type CreditCardPurchaseMutationInput = {
  categoryId: string;
  description: string;
  totalAmount: number;
  purchaseDate: string;
  installmentCount: number;
  installmentAmounts: number[];
  isRecurring: boolean;
  notes: string | null;
};

const cardColumns =
  "id, user_id, name, issuer, brand, last_four_digits, credit_limit, closing_day, due_day, currency, linked_account_id, is_active, created_at, updated_at";
const cardSummaryColumns = `${cardColumns}, used_limit, available_limit, current_balance_minor`;
const purchaseColumns =
  "id, user_id, credit_card_id, category_id, description, total_amount, purchase_date, installment_count, is_recurring, status, notes, created_at, updated_at";
const invoiceColumns =
  "id, user_id, credit_card_id, reference_month, closing_date, due_date, status, total_amount, paid_amount, closed_at, paid_at, payment_account_id, payment_transaction_id, created_at, updated_at";
const installmentColumns =
  "id, user_id, purchase_id, credit_card_id, invoice_id, installment_number, installment_count, amount, competence_date, status, created_at, updated_at";

function withCalculatedCommitment(
  card: CreditCardSummary,
  purchases: readonly CreditCardPurchase[],
  installments: readonly CreditCardInstallment[],
  invoices: readonly CreditCardInvoice[],
): CreditCardSummary {
  const commitment = calculateCreditCardCommitment({
    creditLimitMinor: coerceMinorUnits(card.credit_limit),
    closingDay: card.closing_day,
    invoices: invoices
      .filter((invoice) => invoice.credit_card_id === card.id)
      .map((invoice) => ({ referenceMonth: invoice.reference_month })),
    purchases: purchases
      .filter(
        (purchase) =>
          purchase.credit_card_id === card.id && purchase.status === "active",
      )
      .map((purchase) => ({
        id: purchase.id,
        totalAmountMinor: coerceMinorUnits(purchase.total_amount),
        purchaseDate: purchase.purchase_date,
        isRecurring: purchase.is_recurring,
      })),
    installments: installments
      .filter((installment) => installment.credit_card_id === card.id)
      .map((installment) => ({
        purchaseId: installment.purchase_id,
        amountMinor: coerceMinorUnits(installment.amount),
        competenceDate: installment.competence_date,
        status: installment.status,
      })),
  });

  return {
    ...card,
    used_limit: commitment.committedMinor,
    available_limit: commitment.availableMinor,
  };
}

function mutationErrorMessage(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("invalid_purchase_category")) {
    return "Selecione uma categoria de despesa ativa.";
  }
  if (message.includes("invalid_credit_card")) {
    return "O cartão não está disponível.";
  }
  if (message.includes("purchase_structure_locked")) {
    return "Valor, data e parcelas não podem mudar após o fechamento da fatura.";
  }
  if (message.includes("invalid_installment_distribution")) {
    return "A soma e a quantidade das parcelas devem corresponder à compra.";
  }
  if (message.includes("installment_not_editable")) {
    return "A parcela só pode ser editada enquanto a fatura estiver aberta.";
  }
  if (message.includes("invalid_installment_amount")) {
    return "Informe um valor de parcela maior que zero.";
  }
  if (message.includes("purchase_cancellation_locked")) {
    return "A compra não pode ser cancelada após o fechamento ou pagamento.";
  }
  if (message.includes("invoice_not_payable")) {
    return "A fatura precisa estar fechada e possuir valor para ser paga.";
  }
  if (message.includes("invalid_payment_account")) {
    return "A conta deve estar ativa e usar a mesma moeda do cartão.";
  }
  if (message.includes("invoice_payment_inconsistent")) {
    return "O pagamento não pode ser revertido com segurança.";
  }
  if (message.includes("invoice_not_open")) {
    return "Esta fatura não está mais aberta.";
  }
  return "Não foi possível concluir a operação.";
}

export async function listCurrentUserTransferCreditCardDestinations() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("credit_card_summaries")
    .select("id, name, currency, current_balance_minor")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("name");
  const destinations: CreditCardTransferDestination[] = (data ?? []).map(
    (card) => ({
      id: card.id,
      cardName: card.name,
      currency: card.currency,
      currentBalanceMinor: coerceMinorUnits(card.current_balance_minor),
    }),
  );

  return {
    destinations,
    hasError: Boolean(error),
  };
}

export async function listCurrentUserCreditCards() {
  const { supabase, user } = await requireUser();
  const [cardsResult, invoicesResult, purchasesResult, installmentsResult] =
    await Promise.all([
    supabase
      .from("credit_card_summaries")
      .select(cardSummaryColumns)
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("name"),
    supabase
      .from("credit_card_invoices")
      .select(invoiceColumns)
      .eq("user_id", user.id)
      .order("reference_month"),
    supabase
      .from("credit_card_purchases")
      .select(purchaseColumns)
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("credit_card_installments")
      .select(installmentColumns)
      .eq("user_id", user.id),
  ]);

  const invoices = invoicesResult.data ?? [];
  const purchases = purchasesResult.data ?? [];
  const installments = installmentsResult.data ?? [];
  const cards = (cardsResult.data ?? []).map((card) =>
    withCalculatedCommitment(card, purchases, installments, invoices),
  );

  return {
    cards,
    invoices: invoices.filter((invoice) => invoice.status !== "paid"),
    hasError: Boolean(
      cardsResult.error ||
        invoicesResult.error ||
        purchasesResult.error ||
        installmentsResult.error,
    ),
  };
}

export async function getCurrentUserCreditCard(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("credit_card_summaries")
    .select(cardSummaryColumns)
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return { card: data, hasError: Boolean(error) };
}

export async function getCreditCardFormOptions(includeAccountId?: string) {
  const { supabase, user } = await requireUser();
  let query = supabase
    .from("accounts")
    .select("id, name, currency, archived_at")
    .eq("user_id", user.id);
  query = includeAccountId
    ? query.or(`archived_at.is.null,id.eq.${includeAccountId}`)
    : query.is("archived_at", null);
  const { data, error } = await query.order("name");
  return { accounts: data ?? [], hasError: Boolean(error) };
}

export async function createCurrentUserCreditCard(
  input: CreditCardMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("credit_cards").insert({
    user_id: user.id,
    name: input.name,
    issuer: input.issuer,
    brand: input.brand,
    last_four_digits: input.lastFourDigits,
    credit_limit: input.creditLimit,
    closing_day: input.closingDay,
    due_day: input.dueDay,
    currency: input.currency,
    linked_account_id: input.linkedAccountId,
  });
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserCreditCard(
  id: string,
  input: CreditCardMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("credit_cards")
    .update({
      name: input.name,
      issuer: input.issuer,
      brand: input.brand,
      last_four_digits: input.lastFourDigits,
      credit_limit: input.creditLimit,
      closing_day: input.closingDay,
      due_day: input.dueDay,
      currency: input.currency,
      linked_account_id: input.linkedAccountId,
    })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return error || !data
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function setCurrentUserCreditCardActive(
  id: string,
  active: boolean,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("credit_cards")
    .update({ is_active: active })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return error || !data
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function getCreditCardPurchaseFormOptions(cardId: string) {
  const { supabase, user } = await requireUser();
  const [cardResult, categoriesResult] = await Promise.all([
    supabase
      .from("credit_card_summaries")
      .select(cardSummaryColumns)
      .eq("user_id", user.id)
      .eq("id", cardId)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, parent_id, name, context")
      .eq("user_id", user.id)
      .eq("kind", "expense")
      .is("archived_at", null)
      .order("name"),
  ]);
  return {
    card: cardResult.data,
    categories: categoriesResult.data ?? [],
    hasError: Boolean(cardResult.error || categoriesResult.error),
  };
}

export async function getCurrentUserCreditCardDetails(cardId: string) {
  const { supabase, user } = await requireUser();
  const [
    cardResult,
    purchasesResult,
    installmentsResult,
    invoicesResult,
    categoriesResult,
  ] = await Promise.all([
      supabase
        .from("credit_card_summaries")
        .select(cardSummaryColumns)
        .eq("user_id", user.id)
        .eq("id", cardId)
        .maybeSingle(),
      supabase
        .from("credit_card_purchases")
        .select(purchaseColumns)
        .eq("user_id", user.id)
        .eq("credit_card_id", cardId)
        .eq("status", "active")
        .order("purchase_date", { ascending: false }),
      supabase
        .from("credit_card_installments")
        .select(installmentColumns)
        .eq("user_id", user.id)
        .eq("credit_card_id", cardId)
        .order("competence_date"),
      supabase
        .from("credit_card_invoices")
        .select(invoiceColumns)
        .eq("user_id", user.id)
        .eq("credit_card_id", cardId)
        .order("reference_month"),
      supabase
        .from("categories")
        .select("id, parent_id, name")
        .eq("user_id", user.id),
    ]);
  const purchases = purchasesResult.data ?? [];
  const installments = installmentsResult.data ?? [];
  const invoices = invoicesResult.data ?? [];
  return {
    card: cardResult.data
      ? withCalculatedCommitment(
          cardResult.data,
          purchases,
          installments,
          invoices,
        )
      : null,
    purchases,
    installments,
    invoices,
    categories: categoriesResult.data ?? [],
    hasError: Boolean(
      cardResult.error ||
        purchasesResult.error ||
        installmentsResult.error ||
        invoicesResult.error ||
        categoriesResult.error,
    ),
  };
}

export async function getCurrentUserCreditCardPurchase(
  cardId: string,
  purchaseId: string,
) {
  const { supabase, user } = await requireUser();
  const [purchaseResult, installmentsResult] = await Promise.all([
    supabase
      .from("credit_card_purchases")
      .select(purchaseColumns)
      .eq("user_id", user.id)
      .eq("credit_card_id", cardId)
      .eq("id", purchaseId)
      .maybeSingle(),
    supabase
      .from("credit_card_installments")
      .select(installmentColumns)
      .eq("user_id", user.id)
      .eq("credit_card_id", cardId)
      .eq("purchase_id", purchaseId)
      .order("installment_number"),
  ]);
  return {
    purchase: purchaseResult.data,
    installments: installmentsResult.data ?? [],
    hasError: Boolean(purchaseResult.error || installmentsResult.error),
  };
}

export async function createCurrentUserCreditCardPurchase(
  cardId: string,
  input: CreditCardPurchaseMutationInput,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_credit_card_purchase_custom", {
    target_credit_card_id: cardId,
    target_category_id: input.categoryId,
    purchase_description: input.description,
    purchase_total_amount: input.totalAmount,
    target_purchase_date: input.purchaseDate,
    target_installment_count: input.installmentCount,
    target_installment_amounts: input.installmentAmounts,
    purchase_is_recurring: input.isRecurring,
    purchase_notes: input.notes,
  });
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserCreditCardPurchase(
  purchaseId: string,
  input: CreditCardPurchaseMutationInput,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_credit_card_purchase_custom", {
    target_purchase_id: purchaseId,
    target_category_id: input.categoryId,
    purchase_description: input.description,
    purchase_total_amount: input.totalAmount,
    target_purchase_date: input.purchaseDate,
    target_installment_count: input.installmentCount,
    target_installment_amounts: input.installmentAmounts,
    purchase_is_recurring: input.isRecurring,
    purchase_notes: input.notes,
  });
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function cancelCurrentUserCreditCardPurchase(purchaseId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cancel_credit_card_purchase", {
    target_purchase_id: purchaseId,
  });
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserCreditCardInstallmentAmount(
  installmentId: string,
  amountMinor: number,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc(
    "update_credit_card_installment_amount",
    {
      target_installment_id: installmentId,
      target_amount_minor: amountMinor,
    },
  );
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function listCurrentUserCreditCardInvoices(cardId: string) {
  const { supabase, user } = await requireUser();
  const [cardResult, invoicesResult] = await Promise.all([
    supabase
      .from("credit_card_summaries")
      .select(cardSummaryColumns)
      .eq("user_id", user.id)
      .eq("id", cardId)
      .maybeSingle(),
    supabase
      .from("credit_card_invoices")
      .select(invoiceColumns)
      .eq("user_id", user.id)
      .eq("credit_card_id", cardId)
      .order("reference_month", { ascending: false }),
  ]);
  return {
    card: cardResult.data,
    invoices: invoicesResult.data ?? [],
    hasError: Boolean(cardResult.error || invoicesResult.error),
  };
}

export async function getCurrentUserCreditCardInvoice(
  cardId: string,
  invoiceId: string,
) {
  const { supabase, user } = await requireUser();
  const [
    cardResult,
    invoiceResult,
    installmentsResult,
    purchasesResult,
    accountsResult,
  ] =
    await Promise.all([
      supabase
        .from("credit_card_summaries")
        .select(cardSummaryColumns)
        .eq("user_id", user.id)
        .eq("id", cardId)
        .maybeSingle(),
      supabase
        .from("credit_card_invoices")
        .select(invoiceColumns)
        .eq("user_id", user.id)
        .eq("credit_card_id", cardId)
        .eq("id", invoiceId)
        .maybeSingle(),
      supabase
        .from("credit_card_installments")
        .select(installmentColumns)
        .eq("user_id", user.id)
        .eq("credit_card_id", cardId)
        .eq("invoice_id", invoiceId)
        .neq("status", "cancelled")
        .order("installment_number"),
      supabase
        .from("credit_card_purchases")
        .select("id, description, category_id, purchase_date, is_recurring")
        .eq("user_id", user.id)
        .eq("credit_card_id", cardId)
        .eq("status", "active"),
      supabase
        .from("accounts")
        .select("id, name, currency")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("name"),
    ]);
  return {
    card: cardResult.data,
    invoice: invoiceResult.data,
    installments: installmentsResult.data ?? [],
    purchases: purchasesResult.data ?? [],
    accounts: accountsResult.data ?? [],
    hasError: Boolean(
      cardResult.error ||
        invoiceResult.error ||
        installmentsResult.error ||
        purchasesResult.error ||
        accountsResult.error,
    ),
  };
}

export async function closeCurrentUserCreditCardInvoice(invoiceId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("close_credit_card_invoice", {
    target_invoice_id: invoiceId,
  });
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function payCurrentUserCreditCardInvoice(
  invoiceId: string,
  accountId: string,
  paymentDate: string,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("pay_credit_card_invoice", {
    target_invoice_id: invoiceId,
    target_account_id: accountId,
    target_payment_date: paymentDate,
  });
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function reverseCurrentUserCreditCardInvoicePayment(
  invoiceId: string,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc(
    "reverse_credit_card_invoice_payment",
    { target_invoice_id: invoiceId },
  );
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}
