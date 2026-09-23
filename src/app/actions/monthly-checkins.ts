"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closeCurrentUserMonthlyCheckin } from "@/services/finance/monthly-checkins-service";

export async function closeMonthlyCheckin(formData: FormData) {
  const referenceMonth = String(formData.get("referenceMonth") ?? "");
  const observation = String(formData.get("observation") ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-01$/.test(referenceMonth)) redirect("/check-in?message=error");
  const result = await closeCurrentUserMonthlyCheckin(referenceMonth, observation);
  revalidatePath("/check-in");
  revalidatePath("/dashboard");
  redirect(`/check-in?month=${referenceMonth.slice(0, 7)}&message=${result.ok ? "closed" : "error"}`);
}
