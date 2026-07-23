"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/services/auth/server-auth";
import { profileSchema } from "@/utils/auth-validation";

export type ProfileActionState = { status: "idle" | "success" | "error"; message?: string };

export async function updateProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    preferredCurrency: formData.get("preferredCurrency"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      preferred_currency: parsed.data.preferredCurrency,
    })
    .eq("id", user.id);

  if (error) return { status: "error", message: "Não foi possível salvar seu perfil." };
  revalidatePath("/dashboard");
  revalidatePath("/settings/profile");
  return { status: "success", message: "Perfil atualizado com sucesso." };
}
