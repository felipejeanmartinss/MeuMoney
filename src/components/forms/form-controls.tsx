"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { inputClass } from "./form-control-styles";

export { inputClass } from "./form-control-styles";

export function FormMessage({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const colors = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${colors}`}>{children}</div>;
}

export function Field({ label, error, children, compact = false }: { label: string; error?: string; children: ReactNode; compact?: boolean }) {
  return <label className={`grid font-medium text-slate-800 ${compact ? "gap-1 text-xs" : "gap-2 text-sm"}`}><span>{label}</span>{children}{error ? <span className="text-xs font-normal text-red-700">{error}</span> : null}</label>;
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return <div className="relative"><input {...props} type={visible ? "text" : "password"} className={`${inputClass(Boolean(props["aria-invalid"]))} pr-20`} /><button type="button" onClick={() => setVisible((value) => !value)} className="absolute inset-y-0 right-2 my-auto h-9 rounded-lg px-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" aria-label={visible ? "Ocultar senha" : "Exibir senha"}>{visible ? "Ocultar" : "Exibir"}</button></div>;
}

export function SubmitButton({ pending, disabled = false, children, compact = false }: { pending: boolean; disabled?: boolean; children: ReactNode; compact?: boolean }) {
  return <button type="submit" disabled={pending || disabled} className={`${compact ? "min-h-9 rounded-md px-4 text-sm" : "min-h-12 rounded-xl px-5"} bg-blue-700 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60`}>{pending ? "Aguarde…" : children}</button>;
}
