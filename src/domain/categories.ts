import { z } from "zod";
import { FINANCIAL_CONTEXTS } from "./accounts";
import type {
  Category,
  CategoryGroup,
  CategoryKind,
  FinancialContext,
} from "../types/database";

export const CATEGORY_KINDS = ["income", "expense"] as const;
export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: "Receita",
  expense: "Despesa",
};

const optionalParentId = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.uuid("Selecione uma categoria principal válida.").nullable(),
);

export const categoryFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Informe o nome da categoria.").max(80, "Use até 80 caracteres."),
  kind: z.enum(CATEGORY_KINDS, { error: "Selecione receita ou despesa." }),
  context: z.enum(FINANCIAL_CONTEXTS, { error: "Selecione o contexto." }),
  groupId: z.uuid("Selecione um grupo válido."),
  parentId: optionalParentId,
});

export const categoryGroupFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Informe o nome do grupo.").max(80),
  kind: z.enum(CATEGORY_KINDS),
  context: z.enum(FINANCIAL_CONTEXTS),
});

export const categoryIdSchema = z.uuid("Categoria inválida.");
export const categoryGroupIdSchema = z.uuid("Grupo de categorias inválido.");

export type CategoryHierarchyItem = Pick<
  Category,
  "id" | "group_id" | "parent_id" | "name" | "kind" | "context" | "archived_at"
>;

export type CategoryGroupItem = Pick<
  CategoryGroup,
  "id" | "name" | "kind" | "context" | "archived_at"
>;

export type CategoryPathItem = Pick<
  CategoryHierarchyItem,
  "id" | "parent_id" | "name"
>;

export function getCategoryDisplayName(
  category: CategoryPathItem,
  categories: CategoryPathItem[],
) {
  if (!category.parent_id) return category.name;
  const parent = categories.find((item) => item.id === category.parent_id);
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

export function getCategoryQualifiedName(
  category: CategoryPathItem & { group_id: string },
  categories: Array<CategoryPathItem & { group_id: string }>,
  groups: CategoryGroupItem[],
) {
  const group = groups.find((item) => item.id === category.group_id);
  const path = getCategoryDisplayName(category, categories);
  return group ? `${group.name} › ${path}` : path;
}

export function getAvailableCategoryParents(
  categories: CategoryHierarchyItem[],
  selection: {
    categoryId?: string;
    groupId: string;
    kind: CategoryKind;
    context: FinancialContext;
  },
) {
  return categories.filter(
    (category) =>
      category.id !== selection.categoryId &&
      category.group_id === selection.groupId &&
      category.parent_id === null &&
      category.archived_at === null &&
      category.kind === selection.kind &&
      category.context === selection.context,
  );
}
