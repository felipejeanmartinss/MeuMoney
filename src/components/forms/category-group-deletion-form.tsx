"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteCategoryGroup } from "@/app/actions/categories";
import type { FinancialFormState } from "@/app/actions/accounts";
import type { CategoryGroup } from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: FinancialFormState = { status: "idle" };

type ReplacementGroup = Pick<
  CategoryGroup,
  "id" | "name" | "kind" | "context"
>;

export function CategoryGroupDeletionForm({
  groupId,
  groupName,
  categoryCount,
  replacementGroups,
}: {
  groupId: string;
  groupName: string;
  categoryCount: number;
  replacementGroups: ReplacementGroup[];
}) {
  const [state, formAction, pending] = useActionState(
    deleteCategoryGroup,
    initialState,
  );
  const needsReplacement = categoryCount > 0;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={groupId} />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <p className="text-sm leading-6 text-red-900">
        A exclusão do grupo <strong>{groupName}</strong> é definitiva.
        {needsReplacement
          ? ` Suas ${categoryCount} categorias e subcategorias serão movidas para outro grupo.`
          : " O grupo está vazio e pode ser removido diretamente."}
      </p>

      {needsReplacement ? (
        replacementGroups.length > 0 ? (
          <Field
            label={`Mover ${categoryCount} item${categoryCount === 1 ? "" : "s"} para`}
            error={state.fieldErrors?.replacementGroupId?.[0]}
          >
            <select
              className={inputClass(
                Boolean(state.fieldErrors?.replacementGroupId),
              )}
              name="replacementGroupId"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Escolha um grupo compatível
              </option>
              {replacementGroups.map((replacement) => (
                <option key={replacement.id} value={replacement.id}>
                  {replacement.name}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">
              A hierarquia entre categorias e subcategorias será preservada.
            </span>
          </Field>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Crie primeiro outro grupo com a mesma natureza e contexto.
            <Link
              href="/categories/groups/new"
              className="ml-1 font-bold text-blue-700 underline"
            >
              Criar grupo
            </Link>
          </p>
        )
      ) : (
        <input type="hidden" name="replacementGroupId" value="" />
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
        disabled={needsReplacement && replacementGroups.length === 0}
      >
        Excluir grupo definitivamente
      </SubmitButton>
    </form>
  );
}
