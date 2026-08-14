"use client";

import { useId, useMemo, useState } from "react";
import { filterSelectionOptions } from "@/domain/category-selection";
import type { SearchableSelectionOption } from "@/domain/category-selection";

export function SearchableSelect({
  name,
  options,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "Selecione ou digite para buscar",
  emptyMessage = "Nenhuma opção encontrada.",
  invalid = false,
}: {
  name: string;
  options: SearchableSelectionOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  invalid?: boolean;
}) {
  const generatedId = useId();
  const listboxId = `${generatedId}-options`;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );
  const filteredOptions = useMemo(
    () => filterSelectionOptions(options, query).slice(0, 100),
    [options, query],
  );

  function selectOption(option: SearchableSelectionOption) {
    if (value === undefined) setInternalValue(option.value);
    onValueChange?.(option.value);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  }

  function clearSelection(nextQuery: string) {
    if (selectedValue) {
      if (value === undefined) setInternalValue("");
      onValueChange?.("");
    }
    setQuery(nextQuery);
    setOpen(true);
    setActiveIndex(0);
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input type="hidden" name={name} value={selectedValue} />
      <div className="relative">
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && filteredOptions[activeIndex]
              ? `${listboxId}-${activeIndex}`
              : undefined
          }
          aria-invalid={invalid}
          value={open ? query : (selectedOption?.label ?? query)}
          placeholder={placeholder}
          autoComplete="off"
          className={`min-h-12 w-full rounded-xl border bg-white px-3 pr-10 text-slate-950 outline-none transition focus:ring-4 ${
            invalid
              ? "border-red-400 focus:border-red-500 focus:ring-red-100"
              : "border-slate-300 focus:border-blue-600 focus:ring-blue-100"
          }`}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActiveIndex(0);
          }}
          onChange={(event) => clearSelection(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              if (filteredOptions.length > 0) {
                setActiveIndex((current) =>
                  Math.min(current + 1, filteredOptions.length - 1),
                );
              }
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, current - 1));
            } else if (
              event.key === "Enter" &&
              open &&
              filteredOptions[activeIndex]
            ) {
              event.preventDefault();
              selectOption(filteredOptions[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        <button
          type="button"
          aria-label={open ? "Fechar opções" : "Abrir opções"}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setOpen((current) => !current);
            setQuery("");
            setActiveIndex(0);
          }}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500"
        >
          <span aria-hidden="true">{open ? "▲" : "▼"}</span>
        </button>
      </div>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">{emptyMessage}</p>
          ) : (
            filteredOptions.map((option, index) => {
              const showGroup =
                index === 0 ||
                filteredOptions[index - 1]?.group !== option.group;
              return (
                <div key={option.value}>
                  {showGroup ? (
                    <p className="px-3 pb-1 pt-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                      {option.group}
                    </p>
                  ) : null}
                  <button
                    id={`${listboxId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={option.value === selectedValue}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      index === activeIndex
                        ? "bg-blue-50 text-blue-950"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {option.label}
                  </button>
                </div>
              );
            })
          )}
          {filteredOptions.length === 100 ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              Digite mais caracteres para refinar os resultados.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
