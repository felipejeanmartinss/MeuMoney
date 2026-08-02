import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import type { CategoryKind, FinancialContext } from "@/types/database";

export type CategoryMutationInput = {
  name: string;
  kind: CategoryKind;
  context: FinancialContext;
  groupId: string;
  parentId: string | null;
};

export type CategoryGroupMutationInput = {
  name: string;
  kind: CategoryKind;
  context: FinancialContext;
};

export async function listCurrentUserCategories() {
  const { supabase, user } = await requireUser();
  const [categoriesResult, groupsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, user_id, group_id, parent_id, name, kind, context, is_system, archived_at, created_at, updated_at")
      .eq("user_id", user.id)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("category_groups")
      .select("id, user_id, name, kind, context, is_system, archived_at, created_at, updated_at")
      .eq("user_id", user.id)
      .order("context")
      .order("kind")
      .order("name"),
  ]);

  return {
    categories: categoriesResult.data ?? [],
    groups: groupsResult.data ?? [],
    hasError: Boolean(categoriesResult.error || groupsResult.error),
  };
}

export async function getCurrentUserCategory(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .select("id, user_id, group_id, parent_id, name, kind, context, is_system, archived_at, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return { category: data, hasError: Boolean(error) };
}

export async function createCurrentUserCategory(input: CategoryMutationInput) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    group_id: input.groupId,
    parent_id: input.parentId,
    name: input.name,
    kind: input.kind,
    context: input.context,
  });

  if (error?.code === "23505") {
    return {
      ok: false as const,
      message:
        "Já existe uma categoria com esse nome nesta parte da estrutura.",
    };
  }
  if (error?.message.includes("invalid_category_group")) {
    return {
      ok: false as const,
      message:
        "O grupo precisa estar ativo e ter a mesma natureza e contexto da categoria.",
    };
  }
  if (error?.message.includes("invalid_category_parent")) {
    return {
      ok: false as const,
      message:
        "A categoria principal precisa estar ativa e ter a mesma natureza e contexto.",
    };
  }
  return error
    ? { ok: false as const, message: "Não foi possível cadastrar a categoria." }
    : { ok: true as const };
}

export async function updateCurrentUserCategory(id: string, input: CategoryMutationInput) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .update({
      group_id: input.groupId,
      parent_id: input.parentId,
      name: input.name,
      kind: input.kind,
      context: input.context,
    })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    return {
      ok: false as const,
      message:
        "Já existe uma categoria com esse nome nesta parte da estrutura.",
    };
  }
  if (
    error?.message.includes("invalid_category_group") ||
    error?.message.includes("invalid_category_parent") ||
    error?.message.includes("category_cannot_parent_itself") ||
    error?.message.includes("category_with_children_cannot_be_nested")
  ) {
    return {
      ok: false as const,
      message:
        "O grupo e a categoria principal precisam estar ativos e manter a mesma classificação.",
    };
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
    .select("id")
    .maybeSingle();

  if (error?.message.includes("category_has_active_subcategories")) {
    return {
      ok: false as const,
      message:
        "Inative primeiro as subcategorias ativas desta categoria.",
    };
  }

  return error || !data
    ? { ok: false as const, message: "Não foi possível alterar o status da categoria." }
    : { ok: true as const };
}

export async function getCurrentUserCategoryGroup(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("category_groups")
    .select("id, user_id, name, kind, context, is_system, archived_at, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();
  return { group: data, hasError: Boolean(error) };
}

export async function createCurrentUserCategoryGroup(
  input: CategoryGroupMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("category_groups").insert({
    user_id: user.id,
    name: input.name,
    kind: input.kind,
    context: input.context,
  });
  return error
    ? {
        ok: false as const,
        message:
          error.code === "23505"
            ? "Já existe um grupo com esse nome."
            : "Não foi possível criar o grupo.",
      }
    : { ok: true as const };
}

export async function updateCurrentUserCategoryGroup(
  id: string,
  input: CategoryGroupMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("category_groups")
    .update({ name: input.name, kind: input.kind, context: input.context })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error?.message.includes("category_group_classification_in_use")) {
    return {
      ok: false as const,
      message:
        "Mova as categorias antes de alterar a natureza ou o contexto do grupo.",
    };
  }
  if (error?.code === "23505") {
    return {
      ok: false as const,
      message: "Já existe um grupo com esse nome.",
    };
  }
  return error || !data
    ? { ok: false as const, message: "Não foi possível atualizar o grupo." }
    : { ok: true as const };
}
