import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import type { CategoryKind, FinancialContext } from "@/types/database";

export type CategoryMutationInput = {
  name: string;
  kind: CategoryKind;
  context: FinancialContext;
};

export async function listCurrentUserCategories() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .select("id, user_id, parent_id, name, kind, context, is_system, archived_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  return { categories: data ?? [], hasError: Boolean(error) };
}

export async function getCurrentUserCategory(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .select("id, user_id, parent_id, name, kind, context, is_system, archived_at, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("is_system", false)
    .maybeSingle();

  return { category: data, hasError: Boolean(error) };
}

export async function createCurrentUserCategory(input: CategoryMutationInput) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    name: input.name,
    kind: input.kind,
    context: input.context,
  });

  if (error?.code === "23505") {
    return { ok: false as const, message: "Já existe uma categoria com esse nome, tipo e contexto." };
  }
  return error
    ? { ok: false as const, message: "Não foi possível cadastrar a categoria." }
    : { ok: true as const };
}

export async function updateCurrentUserCategory(id: string, input: CategoryMutationInput) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .update({ name: input.name, kind: input.kind, context: input.context })
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("is_system", false)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    return { ok: false as const, message: "Já existe uma categoria com esse nome, tipo e contexto." };
  }
  return error || !data
    ? { ok: false as const, message: "Não foi possível atualizar a categoria." }
    : { ok: true as const };
}

export async function setCurrentUserCategoryArchived(id: string, archived: boolean) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("is_system", false)
    .select("id")
    .maybeSingle();

  return error || !data
    ? { ok: false as const, message: "Não foi possível alterar o status da categoria." }
    : { ok: true as const };
}
