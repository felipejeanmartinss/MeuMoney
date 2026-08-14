"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteCategory } from "@/app/actions/categories";
import type { FinancialFormState } from "@/app/actions/accounts";
import { getCategoryDisplayName } from "@/domain/categories";
import type { Category } from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: FinancialFormState = { status: "idle" };

type ReplacementCategory = Pick<
  Category,
  "id" | "parent_id" | "name" | "kind" | "context"
>;

export function CategoryDeletionForm({
  categoryId,
  categoryName,
  referenceCount,
  childCount,
  replacementCategories,
}: {
  categoryId: string;
  categoryName: string;
  referenceCount: number;
  childCount: number;
  replacementCategories: ReplacementCategory[];
}) {
  const [state, formAction, pending] = useActionState(
    deleteCategory,
    initialState,
  );
  const needsReplacement = referenceCount > 0;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={categoryId} />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <p className="text-sm leading-6 text-red-900">
        A exclusão de <strong>{categoryName}</strong> é definitiva.
        {childCount > 0
          ? ` Suas ${childCount} subcategorias também serão excluídas.`
          : ""}
      </p>

      {needsReplacement ? (
        replacementCategories.length > 0 ? (
          <Field
            label={`Mover ${referenceCount} vínculo${referenceCount === 1 ? "" : "s"} para`}
            error={state.fieldErrors?.replacementCategoryId?.[0]}
          >
            <select
              className={inputClass(
                Boolean(state.fieldErrors?.replacementCategoryId),
              )}
              name="replacementCategoryId"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Escolha uma categoria ou subcategoria
              </option>
              {replacementCategories.map((replacement) => (
                <option key={replacement.id} value={replacement.id}>
                  {getCategoryDisplayName(
                    replacement,
                    replacementCategories,
                  )}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">
              Lançamentos, recorrências, compras, orçamentos e revisões de
              importação serão realocados na mesma operação.
            </span>
          </Field>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Crie primeiro outra categoria compatível para receber os dados.
            <Link
              href="/categories/new"
              className="ml-1 font-bold text-blue-700 underline"
            >
              Criar categoria
            </Link>
          </p>
        )
      ) : (
        <input type="hidden" name="replacementCategoryId" value="" />
      )}

      <Field
        label="Confirmação"
        error={state.fieldErrors?.confirmation?.[0]}
      >
        <input
          className={inputClass(Boolean(state.fieldErrors?.confirmation))}
          name="confirmation"
          placeholder="Digite EXCLUIR"
          autoComplete="off"
          required
        />
      </Field>

      <SubmitButton
        pending={pending}
        disabled={needsReplacement && replacementCategories.length === 0}
      >
        Excluir categoria definitivamente
      </SubmitButton>
    </form>
  );
}
