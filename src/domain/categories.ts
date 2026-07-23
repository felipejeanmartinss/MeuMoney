import { z } from "zod";
import { FINANCIAL_CONTEXTS } from "./accounts";
import type { CategoryKind } from "../types/database";

export const CATEGORY_KINDS = ["income", "expense"] as const;
export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: "Receita",
  expense: "Despesa",
};

export const categoryFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Informe o nome da categoria.").max(80, "Use até 80 caracteres."),
  kind: z.enum(CATEGORY_KINDS, { error: "Selecione receita ou despesa." }),
  context: z.enum(FINANCIAL_CONTEXTS, { error: "Selecione o contexto." }),
});

export const categoryIdSchema = z.uuid("Categoria inválida.");
