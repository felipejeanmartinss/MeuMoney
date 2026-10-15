"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentIrpfMonth, IRPF_MONTH_FIELDS, type IrpfMonthProjection } from "@/domain/irpf-simulator";
import { parseMoneyInputToMinor } from "@/domain/money";
import { saveCurrentUserIrpfProjections } from "@/services/finance/irpf-simulator-service";

export async function saveIrpfProjections(formData: FormData) {
  const current = currentIrpfMonth();
  const projections: IrpfMonthProjection[] = [];
  for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
    const month = `2026-${String(monthNumber).padStart(2, "0")}`;
    if (month < current) continue;
    const row: IrpfMonthProjection = { month };
    for (const field of IRPF_MONTH_FIELDS) {
      const raw = formData.get(`${month}.${field}`);
      if (raw !== null && typeof raw !== "string") redirect("/reports/irpf?status=invalid");
      if (!raw?.trim()) {
        row[field] = null;
        continue;
      }
      try {
        const amount = parseMoneyInputToMinor(raw);
        if (amount < 0) throw new Error("Valor negativo.");
        row[field] = amount;
      } catch {
        redirect("/reports/irpf?status=invalid");
      }
    }
    projections.push(row);
  }
  const saved = await saveCurrentUserIrpfProjections(projections).catch(() => false);
  if (!saved) redirect("/reports/irpf?status=error");
  revalidatePath("/reports/irpf");
  redirect("/reports/irpf?status=saved");
}
