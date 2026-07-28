"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteCurrentUserAccount,
  restoreCurrentUserBackup,
} from "@/services/security/personal-data-service";

export type SecurityActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function restoreBackup(
  _previousState: SecurityActionState,
  formData: FormData,
): Promise<SecurityActionState> {
  const file = formData.get("backup");
  if (!(file instanceof File)) {
    return { status: "error", message: "Selecione um backup JSON." };
  }
  const result = await restoreCurrentUserBackup(file);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/", "layout");
  return {
    status: "success",
    message: "Backup restaurado. Todos os dados foram validados e substituídos.",
  };
}

export async function deleteAccount(
  _previousState: SecurityActionState,
  formData: FormData,
): Promise<SecurityActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 8) {
    return { status: "error", message: "Informe sua senha atual." };
  }
  if (confirmation !== "EXCLUIR MINHA CONTA") {
    return {
      status: "error",
      message: "Digite exatamente EXCLUIR MINHA CONTA para confirmar.",
    };
  }

  const result = await deleteCurrentUserAccount(password);
  if (!result.ok) return { status: "error", message: result.message };
  redirect("/login?message=account-deleted");
}
