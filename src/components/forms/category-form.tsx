"use client";

import { useActionState, useState } from "react";
import {
  createCategory,
  updateCategory,
} from "@/app/actions/categories";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  CONTEXT_LABELS,
  FINANCIAL_CONTEXTS,
} from "@/domain/accounts";
import {
  CATEGORY_KIND_LABELS,
  CATEGORY_KINDS,
  getAvailableCategoryParents,
  type CategoryHierarchyItem,
} from "@/domain/categories";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import type { CategoryKind, FinancialContext } from "@/types/database";

type CategoryFormValues = {
  id?: string;
  name?: string;
  kind?: CategoryKind;
  context?: FinancialContext;
  parentId?: string | null;
};

const initialState: FinancialFormState = { status: "idle" };

export function CategoryForm({
  categories,
  values,
}: {
  categories: CategoryHierarchyItem[];
  values: CategoryFormValues;
}) {
  const action = values.id ? updateCategory : createCategory;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [kind, setKind] = useState<CategoryKind>(values.kind ?? "expense");
  const [context, setContext] = useState<FinancialContext>(
    values.context ?? "personal",
  );
  const [parentId, setParentId] = useState(values.parentId ?? "");
  const availableParents = getAvailableCategoryParents(categories, {
    categoryId: values.id,
    kind,
    context,
  });

  function updateClassification(
    nextKind: CategoryKind,
    nextContext: FinancialContext,
  ) {
    setKind(nextKind);
    setContext(nextContext);
    const selectedParent = categories.find(
      (category) => category.id === parentId,
    );
    if (
      !selectedParent ||
      selectedParent.kind !== nextKind ||
      selectedParent.context !== nextContext
    ) {
      setParentId("");
    }
  }

  return (
    <form action={formAction} className="grid gap-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field label="Nome da categoria" error={state.fieldErrors?.name?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.name))}
          name="name"
          defaultValue={values.name}
          placeholder="Ex.: Cuidados com pets"
          autoComplete="off"
          maxLength={80}
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Natureza" error={state.fieldErrors?.kind?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.kind))}
            name="kind"
            value={kind}
            onChange={(event) =>
              updateClassification(
                event.target.value as CategoryKind,
                context,
              )
            }
            required
            aria-invalid={Boolean(state.fieldErrors?.kind)}
          >
            {CATEGORY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {CATEGORY_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Contexto" error={state.fieldErrors?.context?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.context))}
            name="context"
            value={context}
            onChange={(event) =>
              updateClassification(
                kind,
                event.target.value as FinancialContext,
              )
            }
            required
            aria-invalid={Boolean(state.fieldErrors?.context)}
          >
            {FINANCIAL_CONTEXTS.map((context) => (
              <option key={context} value={context}>
                {CONTEXT_LABELS[context]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Categoria principal"
        error={state.fieldErrors?.parentId?.[0]}
      >
        <select
          className={inputClass(Boolean(state.fieldErrors?.parentId))}
          name="parentId"
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.parentId)}
        >
          <option value="">Nenhuma — esta é uma categoria principal</option>
          {availableParents.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Selecione uma categoria principal para criar uma subcategoria. A
          hierarquia possui um nível para manter relatórios e filtros claros.
        </p>
      </Field>

      <SubmitButton pending={pending}>
        {values.id ? "Salvar alterações" : "Criar categoria"}
      </SubmitButton>
    </form>
  );
}
