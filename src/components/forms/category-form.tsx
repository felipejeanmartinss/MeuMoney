"use client";

import { useActionState } from "react";
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
} from "@/domain/categories";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import type { CategoryKind, FinancialContext } from "@/types/database";

type CategoryFormValues = {
  id?: string;
  name?: string;
  kind?: CategoryKind;
  context?: FinancialContext;
};

const initialState: FinancialFormState = { status: "idle" };

export function CategoryForm({
  values,
}: {
  values: CategoryFormValues;
}) {
  const action = values.id ? updateCategory : createCategory;
  const [state, formAction, pending] = useActionState(action, initialState);

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
            defaultValue={values.kind ?? "expense"}
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
            defaultValue={values.context ?? "personal"}
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

      <SubmitButton pending={pending}>
        {values.id ? "Salvar alterações" : "Criar categoria"}
      </SubmitButton>
    </form>
  );
}
