"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  quickCreateCategory,
  type QuickCategoryFormState,
} from "@/app/actions/categories";
import { CONTEXT_LABELS, FINANCIAL_CONTEXTS } from "@/domain/accounts";
import {
  CATEGORY_KIND_LABELS,
  getAvailableCategoryParents,
  type CategoryGroupItem,
  type CategoryHierarchyItem,
} from "@/domain/categories";
import type { CategoryKind, FinancialContext } from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

export type QuickCreatedCategory = NonNullable<
  QuickCategoryFormState["category"]
>;

const initialState: QuickCategoryFormState = { status: "idle" };

export function QuickCategoryCreate({
  open,
  kind,
  categories,
  groups,
  onCreated,
  onClose,
}: {
  open: boolean;
  kind: CategoryKind;
  categories: CategoryHierarchyItem[];
  groups: CategoryGroupItem[];
  onCreated: (category: QuickCreatedCategory) => void;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    quickCreateCategory,
    initialState,
  );
  const [context, setContext] = useState<FinancialContext>("personal");
  const matchingGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          group.kind === kind &&
          group.context === context &&
          group.archived_at === null,
      ),
    [context, groups, kind],
  );
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const groupId = matchingGroups.some(
    (group) => group.id === selectedGroupId,
  )
    ? selectedGroupId
    : (matchingGroups[0]?.id ?? "");
  const [parentId, setParentId] = useState("");
  const availableParents = getAvailableCategoryParents(categories, {
    groupId,
    kind,
    context,
  });

  useEffect(() => {
    if (state.category) onCreated(state.category);
  }, [onCreated, state.category]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-category-title"
        className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">
              {CATEGORY_KIND_LABELS[kind]}
            </p>
            <h2
              id="quick-category-title"
              className="mt-1 text-2xl font-extrabold text-slate-950"
            >
              Criar categoria sem sair do lançamento
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar criação de categoria"
            className="min-h-10 rounded-lg px-3 font-bold text-slate-600 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <form action={formAction} className="mt-6 grid gap-4">
          <input type="hidden" name="kind" value={kind} />
          {state.message ? <FormMessage>{state.message}</FormMessage> : null}
          <Field label="Nome" error={state.fieldErrors?.name?.[0]}>
            <input
              autoFocus
              className={inputClass(Boolean(state.fieldErrors?.name))}
              name="name"
              maxLength={80}
              placeholder="Ex.: Energia elétrica"
              required
            />
          </Field>
          <Field label="Contexto" error={state.fieldErrors?.context?.[0]}>
            <select
              className={inputClass(Boolean(state.fieldErrors?.context))}
              name="context"
              value={context}
              onChange={(event) => {
                setContext(event.target.value as FinancialContext);
                setSelectedGroupId("");
                setParentId("");
              }}
            >
              {FINANCIAL_CONTEXTS.map((item) => (
                <option key={item} value={item}>
                  {CONTEXT_LABELS[item]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grupo" error={state.fieldErrors?.groupId?.[0]}>
            <select
              className={inputClass(Boolean(state.fieldErrors?.groupId))}
              name="groupId"
              value={groupId}
              onChange={(event) => {
                setSelectedGroupId(event.target.value);
                setParentId("");
              }}
              required
            >
              <option value="">Selecione</option>
              {matchingGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Categoria principal (opcional)"
            error={state.fieldErrors?.parentId?.[0]}
          >
            <select
              className={inputClass(Boolean(state.fieldErrors?.parentId))}
              name="parentId"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">Criar como categoria principal</option>
              {availableParents.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          {matchingGroups.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Crie primeiro um grupo compatível na administração de categorias.
            </p>
          ) : null}
          <SubmitButton pending={pending} disabled={matchingGroups.length === 0}>
            Criar e selecionar
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
