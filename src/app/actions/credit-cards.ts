"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  creditCardFormSchema,
  creditCardIdSchema,
  creditCardInstallmentAmountFormSchema,
  creditCardInstallmentIdSchema,
  creditCardInvoiceIdSchema,
  creditCardPurchaseFormSchema,
  creditCardPurchaseIdSchema,
  invoicePaymentFormSchema,
} from "@/domain/credit-cards";
import {
  cancelCurrentUserCreditCardPurchase,
  closeCurrentUserCreditCardInvoice,
  createCurrentUserCreditCard,
  createCurrentUserCreditCardPurchase,
  payCurrentUserCreditCardInvoice,
  reverseCurrentUserCreditCardInvoicePayment,
  setCurrentUserCreditCardActive,
  updateCurrentUserCreditCard,
  updateCurrentUserCreditCardInstallmentAmount,
  updateCurrentUserCreditCardPurchase,
} from "@/services/finance/credit-cards-service";

const cardInputFrom = (formData: FormData) => ({
  name: formData.get("name"),
  issuer: formData.get("issuer"),
  brand: formData.get("brand"),
  lastFourDigits: formData.get("lastFourDigits"),
  creditLimit: formData.get("creditLimit"),
  closingDay: formData.get("closingDay"),
  dueDay: formData.get("dueDay"),
  currency: formData.get("currency"),
  linkedAccountId: formData.get("linkedAccountId"),
});

const purchaseInputFrom = (formData: FormData) => ({
  categoryId: formData.get("categoryId"),
  description: formData.get("description"),
  totalAmount: formData.get("totalAmount"),
  purchaseDate: formData.get("purchaseDate"),
  installmentCount: formData.get("installmentCount"),
  installmentAmounts: formData.getAll("installmentAmounts"),
  isRecurring: formData.get("isRecurring") === "true",
  notes: formData.get("notes") ?? "",
});

function revalidateCardPaths(cardId?: string) {
  revalidatePath("/credit-cards");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  if (cardId) revalidatePath(`/credit-cards/${cardId}`);
}

export async function createCreditCard(
  _state: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = creditCardFormSchema.safeParse(cardInputFrom(formData));
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const result = await createCurrentUserCreditCard(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidateCardPaths();
  redirect("/credit-cards?message=created");
}

export async function updateCreditCard(
  _state: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = creditCardFormSchema.safeParse(cardInputFrom(formData));
  const id = creditCardIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !id.success) {
    return {
      status: "error",
      message: id.success ? undefined : "Cartão inválido.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }
  const result = await updateCurrentUserCreditCard(id.data, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidateCardPaths(id.data);
  redirect(`/credit-cards/${id.data}?message=updated`);
}

export async function toggleCreditCardActivity(formData: FormData) {
  const id = creditCardIdSchema.safeParse(formData.get("id"));
  if (!id.success) redirect("/credit-cards?message=status-error");
  const result = await setCurrentUserCreditCardActive(
    id.data,
    formData.get("active") === "true",
  );
  revalidateCardPaths(id.data);
  redirect(
    `/credit-cards?message=${result.ok ? "status-updated" : "status-error"}`,
  );
}

export async function createCreditCardPurchase(
  _state: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const cardId = creditCardIdSchema.safeParse(formData.get("cardId"));
  const parsed = creditCardPurchaseFormSchema.safeParse(
    purchaseInputFrom(formData),
  );
  if (!cardId.success || !parsed.success) {
    return {
      status: "error",
      message: cardId.success ? undefined : "Cartão inválido.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }
  const result = await createCurrentUserCreditCardPurchase(
    cardId.data,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidateCardPaths(cardId.data);
  redirect(`/credit-cards/${cardId.data}?message=purchase-created`);
}

export async function updateCreditCardPurchase(
  _state: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const cardId = creditCardIdSchema.safeParse(formData.get("cardId"));
  const purchaseId = creditCardPurchaseIdSchema.safeParse(
    formData.get("purchaseId"),
  );
  const parsed = creditCardPurchaseFormSchema.safeParse(
    purchaseInputFrom(formData),
  );
  if (!cardId.success || !purchaseId.success || !parsed.success) {
    return {
      status: "error",
      message:
        cardId.success && purchaseId.success ? undefined : "Compra inválida.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }
  const result = await updateCurrentUserCreditCardPurchase(
    purchaseId.data,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidateCardPaths(cardId.data);
  redirect(`/credit-cards/${cardId.data}?message=purchase-updated`);
}

export async function cancelCreditCardPurchase(formData: FormData) {
  const cardId = creditCardIdSchema.safeParse(formData.get("cardId"));
  const purchaseId = creditCardPurchaseIdSchema.safeParse(
    formData.get("purchaseId"),
  );
  if (!cardId.success || !purchaseId.success) {
    redirect("/credit-cards?message=purchase-error");
  }
  const result = await cancelCurrentUserCreditCardPurchase(purchaseId.data);
  revalidateCardPaths(cardId.data);
  redirect(
    `/credit-cards/${cardId.data}?message=${
      result.ok ? "purchase-cancelled" : "purchase-error"
    }`,
  );
}

export async function closeCreditCardInvoice(formData: FormData) {
  const cardId = creditCardIdSchema.safeParse(formData.get("cardId"));
  const invoiceId = creditCardInvoiceIdSchema.safeParse(
    formData.get("invoiceId"),
  );
  if (!cardId.success || !invoiceId.success) {
    redirect("/credit-cards?message=invoice-error");
  }
  const result = await closeCurrentUserCreditCardInvoice(invoiceId.data);
  revalidateCardPaths(cardId.data);
  redirect(
    `/credit-cards/${cardId.data}/invoices/${invoiceId.data}?message=${
      result.ok ? "invoice-closed" : "invoice-error"
    }`,
  );
}

export async function updateCreditCardInstallmentAmount(formData: FormData) {
  const cardId = creditCardIdSchema.safeParse(formData.get("cardId"));
  const invoiceId = creditCardInvoiceIdSchema.safeParse(
    formData.get("invoiceId"),
  );
  const installmentId = creditCardInstallmentIdSchema.safeParse(
    formData.get("installmentId"),
  );
  const parsed = creditCardInstallmentAmountFormSchema.safeParse({
    amount: formData.get("amount"),
  });
  if (!cardId.success || !invoiceId.success || !installmentId.success) {
    redirect("/credit-cards?message=invoice-error");
  }
  if (!parsed.success) {
    redirect(
      `/credit-cards/${cardId.data}/invoices/${invoiceId.data}?message=installment-error`,
    );
  }

  const result = await updateCurrentUserCreditCardInstallmentAmount(
    installmentId.data,
    parsed.data.amount,
  );
  revalidateCardPaths(cardId.data);
  revalidatePath(`/credit-cards/${cardId.data}/invoices/${invoiceId.data}`);
  redirect(
    `/credit-cards/${cardId.data}/invoices/${invoiceId.data}?message=${
      result.ok ? "installment-updated" : "installment-error"
    }`,
  );
}

export async function payCreditCardInvoice(
  _state: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const cardId = creditCardIdSchema.safeParse(formData.get("cardId"));
  const invoiceId = creditCardInvoiceIdSchema.safeParse(
    formData.get("invoiceId"),
  );
  const parsed = invoicePaymentFormSchema.safeParse({
    accountId: formData.get("accountId"),
    paymentDate: formData.get("paymentDate"),
    confirmation: formData.get("confirmation"),
  });
  if (!cardId.success || !invoiceId.success || !parsed.success) {
    return {
      status: "error",
      message:
        cardId.success && invoiceId.success ? undefined : "Fatura inválida.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }
  const result = await payCurrentUserCreditCardInvoice(
    invoiceId.data,
    parsed.data.accountId,
    parsed.data.paymentDate,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidateCardPaths(cardId.data);
  redirect(
    `/credit-cards/${cardId.data}/invoices/${invoiceId.data}?message=invoice-paid`,
  );
}

export async function reverseCreditCardInvoicePayment(formData: FormData) {
  const cardId = creditCardIdSchema.safeParse(formData.get("cardId"));
  const invoiceId = creditCardInvoiceIdSchema.safeParse(
    formData.get("invoiceId"),
  );
  if (!cardId.success || !invoiceId.success) {
    redirect("/credit-cards?message=invoice-error");
  }
  if (formData.get("confirmation") !== "yes") {
    redirect(
      `/credit-cards/${cardId.data}/invoices/${invoiceId.data}?message=invoice-error`,
    );
  }
  const result = await reverseCurrentUserCreditCardInvoicePayment(
    invoiceId.data,
  );
  revalidateCardPaths(cardId.data);
  redirect(
    `/credit-cards/${cardId.data}/invoices/${invoiceId.data}?message=${
      result.ok ? "payment-reversed" : "invoice-error"
    }`,
  );
}
