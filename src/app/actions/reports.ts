"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { financialReportTypeSchema } from "@/domain/financial-reports";
import {
  createCurrentUserSavedFinancialReport,
  deleteCurrentUserSavedFinancialReport,
} from "@/services/reports/saved-financial-reports-service";
import type { Json } from "@/types/database";

const savedReportIdSchema = z.uuid();
const savedReportNameSchema = z.string().trim().min(1).max(80);

export async function saveFinancialReport(formData: FormData) {
  const name = savedReportNameSchema.safeParse(formData.get("name"));
  const reportType = financialReportTypeSchema.safeParse(formData.get("reportType"));
  let filters: Json = {};
  try {
    const parsed = JSON.parse(String(formData.get("filters") ?? "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    filters = parsed as Json;
  } catch {
    redirect("/reports?message=save-error");
  }
  if (!name.success || !reportType.success) {
    redirect("/reports?message=save-error");
  }
  const result = await createCurrentUserSavedFinancialReport({
    name: name.data,
    reportType: reportType.data,
    filters,
  });
  revalidatePath("/reports");
  redirect(`/reports?report=${reportType.data}&message=${result.ok ? "saved" : "save-error"}`);
}

export async function deleteSavedFinancialReport(formData: FormData) {
  const id = savedReportIdSchema.safeParse(formData.get("id"));
  const result = id.success
    ? await deleteCurrentUserSavedFinancialReport(id.data)
    : { ok: false as const };
  revalidatePath("/reports");
  redirect(`/reports?message=${result.ok ? "saved-deleted" : "delete-error"}`);
}
