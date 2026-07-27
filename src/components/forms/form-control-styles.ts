export function inputClass(hasError = false) {
  return `min-h-12 w-full rounded-xl border bg-white px-3.5 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-4 ${hasError ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-blue-600 focus:ring-blue-100"}`;
}
