"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  netWorthItemFormSchema,
  netWorthItemIdSchema,
} from "@/domain/net-worth";
import {
  createCurrentUserNetWorthItem,
  setCurrentUserNetWorthItemArchived,
  updateCurrentUserNetWorthItem,
} from "@/services/finance/net-worth-service";

export type NetWorthFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const netWorthItemInputFrom = (formData: FormData) => ({
  id: formData.get("id")?.toString(),
  itemType: formData.get("itemType"),
  name: formData.get("name"),
  currency: formData.get("currency"),
  currentValueMinor: formData.get("currentValueMinor"),
  valuationDate: formData.get("valuationDate"),
  context: formData.get("context"),
  notes: formData.get("notes") ?? "",
});

export async function createNetWorthItem(
  _previousState: NetWorthFormState,
  formData: FormData,
): Promise<NetWorthFormState> {
  const parsed = netWorthItemFormSchema.safeParse(
    netWorthItemInputFrom(formData),
  );
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await createCurrentUserNetWorthItem(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/net-worth");
  redirect("/net-worth?message=created");
}

export async function updateNetWorthItem(
  _previousState: NetWorthFormState,
  formData: FormData,
): Promise<NetWorthFormState> {
  const parsed = netWorthItemFormSchema.safeParse(
    netWorthItemInputFrom(formData),
  );
  const parsedId = netWorthItemIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !parsedId.success) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Item patrimonial inválido.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }

  const result = await updateCurrentUserNetWorthItem(
    parsedId.data,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/net-worth");
  redirect("/net-worth?message=updated");
}

export async function toggleNetWorthItemStatus(formData: FormData) {
  const parsedId = netWorthItemIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) redirect("/net-worth?message=status-error");

  const archived = formData.get("archive") === "true";
  const result = await setCurrentUserNetWorthItemArchived(
    parsedId.data,
    archived,
  );
  revalidatePath("/net-worth");
  redirect(
    `/net-worth?message=${result.ok ? "status-updated" : "status-error"}`,
  );
}
