"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  categoryFormSchema,
  categoryGroupFormSchema,
  categoryGroupIdSchema,
  categoryIdSchema,
} from "@/domain/categories";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  createCurrentUserCategory,
  createCurrentUserCategoryGroup,
  setCurrentUserCategoryArchived,
  updateCurrentUserCategory,
  updateCurrentUserCategoryGroup,
} from "@/services/finance/categories-service";

const categoryInputFrom = (formData: FormData) => ({
  id: formData.get("id")?.toString(),
  name: formData.get("name"),
  kind: formData.get("kind"),
  context: formData.get("context"),
  groupId: formData.get("groupId"),
  parentId: formData.get("parentId"),
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
