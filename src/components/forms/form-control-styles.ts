export function inputClass(hasError = false, compact = false) {
  const density = compact
    ? "min-h-9 rounded-md px-2.5 text-sm focus:ring-2"
    : "min-h-12 rounded-xl px-3.5 text-base focus:ring-4";
  return `${density} w-full border bg-white text-slate-950 outline-none transition placeholder:text-slate-400 ${hasError ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-blue-600 focus:ring-blue-100"}`;
}
