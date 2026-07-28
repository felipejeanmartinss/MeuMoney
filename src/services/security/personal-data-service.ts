import "server-only";
import {
  MAX_PERSONAL_BACKUP_BYTES,
  parsePersonalBackup,
  type PersonalBackup,
} from "@/domain/personal-backup";
import { reportServerError } from "@/lib/monitoring";
import { requireUser } from "@/services/auth/server-auth";
import { createAdminClient } from "@/services/supabase/admin";
import type { CriticalOperationEventType, Json } from "@/types/database";

export async function recordCriticalOperation(
  eventType: CriticalOperationEventType,
  outcome: "success" | "failure",
  resourceType: string | null,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("record_critical_operation", {
    target_event_type: eventType,
    target_outcome: outcome,
    target_resource_type: resourceType,
  });
  if (error) reportServerError(error, { routePath: "critical-operation" });
}

export async function listCriticalOperations() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("critical_operation_events")
    .select("id, event_type, outcome, resource_type, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    reportServerError(error, { routePath: "/settings/security" });
    return { events: [], hasError: true };
  }
  return { events: data ?? [], hasError: false };
}

export async function exportCurrentUserBackup() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc("export_personal_backup");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    reportServerError(error, { routePath: "/api/account/export" });
    throw new Error("personal_backup_export_failed");
  }

  const backup = {
    ...data,
    identity: user.email ? { email: user.email } : undefined,
  };
  const parsed = parsePersonalBackup(backup);
  if (!parsed.success) {
    reportServerError(new Error("invalid_export_result"), {
      routePath: "/api/account/export",
    });
    throw new Error("personal_backup_export_failed");
  }

  await recordCriticalOperation("data_exported", "success", "personal_backup");
  return parsed.data;
}

export async function restoreCurrentUserBackup(file: File) {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, message: "Selecione um backup JSON." };
  }
  if (file.size > MAX_PERSONAL_BACKUP_BYTES) {
    return {
      ok: false as const,
      message: "O backup deve ter no máximo 10 MB.",
    };
  }

  let backup: PersonalBackup;
  try {
    const parsed = parsePersonalBackup(JSON.parse(await file.text()));
    if (!parsed.success) {
      return {
        ok: false as const,
        message: "O arquivo não é um backup válido do MeuMoney.",
      };
    }
    backup = parsed.data;
  } catch {
    return {
      ok: false as const,
      message: "O arquivo não contém um JSON válido.",
    };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("restore_personal_backup", {
    target_backup: backup as unknown as Json,
  });
  if (error) {
    reportServerError(error, { routePath: "/settings/security/restore" });
    return {
      ok: false as const,
      message:
        "Não foi possível restaurar. Seus dados atuais foram preservados.",
    };
  }
  return { ok: true as const };
}

export async function deleteCurrentUserAccount(password: string) {
  const { supabase, user } = await requireUser();
  if (!user.email) {
    return {
      ok: false as const,
      message: "A conta não possui um e-mail válido.",
    };
  }

  const { error: authenticationError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (authenticationError) {
    return {
      ok: false as const,
      message: "A senha atual não foi confirmada.",
    };
  }

  await recordCriticalOperation(
    "account_deletion_requested",
    "success",
    "account",
  );

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    await supabase.auth.signOut({ scope: "local" });
    return { ok: true as const };
  } catch (error) {
    await recordCriticalOperation(
      "account_deletion_failed",
      "failure",
      "account",
    );
    reportServerError(error, { routePath: "/settings/security/delete" });
    return {
      ok: false as const,
      message: "Não foi possível excluir a conta. Tente novamente mais tarde.",
    };
  }
}
