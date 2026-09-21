"use client";

import { useState } from "react";

type CheckboxFilterOption = { value: string; label: string };

export function CheckboxFilter({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: CheckboxFilterOption[];
  selected: string[];
}) {
  const [checkedValues, setCheckedValues] = useState<Set<string>>(
    () => new Set(selected.length === 0 ? options.map((option) => option.value) : selected),
  );
  const allSelected = options.length > 0 && checkedValues.size === options.length;

  function toggle(value: string) {
    setCheckedValues((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <fieldset className="grid min-w-0 gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
      <legend>{label}</legend>
      <details className="relative">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 normal-case tracking-normal text-slate-900 marker:hidden">
          <span className="truncate font-semibold">
            {allSelected || checkedValues.size === 0
              ? "Todos"
              : `${checkedValues.size} selecionados`}
          </span>
          <span aria-hidden="true" className="text-slate-400">▾</span>
        </summary>
        <div className="absolute left-0 top-full z-30 mt-1 grid max-h-72 min-w-72 gap-1 overflow-auto rounded-lg border border-slate-200 bg-white p-2 normal-case tracking-normal shadow-xl">
          {options.length ? (
            <>
              <button
                type="button"
                onClick={() => setCheckedValues(new Set(options.map((option) => option.value)))}
                className="sticky top-0 z-10 mb-1 min-h-9 rounded-md border-b border-slate-200 bg-white px-2 text-left text-xs font-bold normal-case text-emerald-800 hover:bg-emerald-50"
              >
                Selecionar todas
              </button>
              {options.map((option) => (
                <label key={option.value} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    name={name}
                    value={option.value}
                    checked={checkedValues.has(option.value)}
                    onChange={() => toggle(option.value)}
                    className="size-4 accent-emerald-700"
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              ))}
            </>
          ) : <span className="px-2 py-1 text-sm font-normal text-slate-500">Nenhuma opção</span>}
        </div>
      </details>
    </fieldset>
  );
}
