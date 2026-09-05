"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  categoryFormSchema,
  categoryDeletionSchema,
  categoryGroupDeletionSchema,
  categoryGroupFormSchema,
  categoryGroupIdSchema,
  categoryIdSchema,
} from "@/domain/categories";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  createCurrentUserCategory,
  createCurrentUserCategoryGroup,
  deleteCurrentUserCategory,
  deleteCurrentUserCategoryGroup,
  setCurrentUserCategoryArchived,
  updateCurrentUserCategory,
  updateCurrentUserCategoryGroup,
} from "@/services/finance/categories-service";
import type { Category } from "@/types/database";

export type QuickCategoryFormState = FinancialFormState & {
  category?: Pick<
    Category,
    | "id"
    | "group_id"
    | "parent_id"
    | "name"
    | "kind"
    | "context"
    | "is_system"
    | "is_fixed_expense"
    | "archived_at"
  >;
};

const categoryInputFrom = (formData: FormData) => ({
  id: formData.get("id")?.toString(),
  name: formData.get("name"),
  kind: formData.get("kind"),
  context: formData.get("context"),
  groupId: formData.get("groupId"),
  parentId: formData.get("parentId"),
  isFixedExpense: formData.get("isFixedExpense"),
});

const categoryGroupInputFrom = (formData: FormData) => ({
  id: formData.get("id")?.toString(),
  name: formData.get("name"),
  kind: formData.get("kind"),
  context: formData.get("context"),
});

export async function createCategory(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = categoryFormSchema.safeParse(categoryInputFrom(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const result = await createCurrentUserCategory(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/categories");
  redirect("/categories?message=created");
}

export async function quickCreateCategory(
  _previousState: QuickCategoryFormState,
  formData: FormData,
): Promise<QuickCategoryFormState> {
  const parsed = categoryFormSchema.safeParse(categoryInputFrom(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const result = await createCurrentUserCategory(parsed.data);
  if (!result.ok || !result.category) {
    return { status: "error", message: result.message };
  }
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/imports");
  return { status: "idle", category: result.category };
}

export async function deleteCategory(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = categoryDeletionSchema.safeParse({
    id: formData.get("id"),
    replacementCategoryId: formData.get("replacementCategoryId"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await deleteCurrentUserCategory(
    parsed.data.id,
    parsed.data.replacementCategoryId,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/recurring-transactions");
  revalidatePath("/credit-cards");
  revalidatePath("/budgets");
  revalidatePath("/imports");
  redirect("/categories?message=deleted");
}

export async function updateCategory(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = categoryFormSchema.safeParse(categoryInputFrom(formData));
  const parsedId = categoryIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !parsedId.success) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Categoria inválida.",
      fieldErrors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
    };
  }
  const result = await updateCurrentUserCategory(parsedId.data, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/categories");
  redirect("/categories?message=updated");
}

export async function toggleCategoryStatus(formData: FormData) {
  const parsedId = categoryIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) redirect("/categories?message=status-error");
  const shouldArchive = formData.get("archive") === "true";
  const result = await setCurrentUserCategoryArchived(parsedId.data, shouldArchive);
  revalidatePath("/categories");
  redirect(`/categories?message=${result.ok ? "status-updated" : "status-error"}`);
}

export async function createCategoryGroup(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = categoryGroupFormSchema.safeParse(
    categoryGroupInputFrom(formData),
  );
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const result = await createCurrentUserCategoryGroup(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/categories");
  redirect("/categories?message=group-created");
}

export async function updateCategoryGroup(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = categoryGroupFormSchema.safeParse(
    categoryGroupInputFrom(formData),
  );
  const parsedId = categoryGroupIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !parsedId.success) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Grupo inválido.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }
  const result = await updateCurrentUserCategoryGroup(
    parsedId.data,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/categories");
  redirect("/categories?message=group-updated");
}

export async function deleteCategoryGroup(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = categoryGroupDeletionSchema.safeParse({
    id: formData.get("id"),
    replacementGroupId: formData.get("replacementGroupId"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await deleteCurrentUserCategoryGroup(
    parsed.data.id,
    parsed.data.replacementGroupId,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/recurring-transactions");
  revalidatePath("/credit-cards");
  revalidatePath("/budgets");
  revalidatePath("/imports");
  redirect("/categories?message=group-deleted");
}
