"use client";

import { useEffect } from "react";

type SortDirection = "ascending" | "descending";

const originalOrder = new WeakMap<HTMLTableRowElement, number>();

function comparableValue(cell: HTMLTableCellElement) {
  const raw = (cell.dataset.sortValue ?? cell.innerText).trim();
  const date = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (date) return { type: "number" as const, value: Number(`${date[3]}${date[2]}${date[1]}`) };

  const normalizedNumber = raw
    .replace(/\s/g, "")
    .replace(/^(R\$|US\$|€)/, "")
    .replace(/%$/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (/^[+-]?\d+(?:\.\d+)?$/.test(normalizedNumber)) {
    return { type: "number" as const, value: Number(normalizedNumber) };
  }
  return { type: "text" as const, value: raw };
}

function sortableRows(table: HTMLTableElement) {
  const headerCount = table.tHead?.rows[0]?.cells.length ?? 0;
  const body = table.tBodies[0];
  if (!body || !headerCount) return null;
  const rows = [...body.rows];
  if (
    rows.length < 2 ||
    rows.some((row) => row.cells.length !== headerCount) ||
    body.querySelector('button[aria-expanded], input:not([type="hidden"]), select, textarea')
  ) {
    return null;
  }
  rows.forEach((row, index) => {
    if (!originalOrder.has(row)) originalOrder.set(row, index);
  });
  return { body, rows };
}

export function TableSortController() {
  useEffect(() => {
    function sortTable(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("a, button, input, select")) return;
      const header = target.closest("th");
      const table = header?.closest("table");
      if (!header || !table || table.dataset.sortable === "false") return;
      const state = sortableRows(table);
      if (!state || !header.parentElement) return;
      const index = [...header.parentElement.children].indexOf(header);
      if (index < 0 || index >= (state.rows[0]?.cells.length ?? 0)) return;

      const current = header.getAttribute("aria-sort");
      const direction: SortDirection =
        current === "ascending" ? "descending" : "ascending";
      for (const candidate of header.parentElement.querySelectorAll("th")) {
        candidate.removeAttribute("aria-sort");
      }
      header.setAttribute("aria-sort", direction);
      header.dataset.sortEnabled = "true";

      state.rows.sort((left, right) => {
        const a = comparableValue(left.cells[index]);
        const b = comparableValue(right.cells[index]);
        const comparison =
          a.type === "number" && b.type === "number"
            ? a.value - b.value
            : String(a.value).localeCompare(String(b.value), "pt-BR", {
                numeric: true,
                sensitivity: "base",
              });
        const ordered = direction === "ascending" ? comparison : -comparison;
        return ordered || (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0);
      });
      state.rows.forEach((row) => state.body.append(row));
    }

    document.addEventListener("click", sortTable);
    return () => document.removeEventListener("click", sortTable);
  }, []);

  return null;
}
