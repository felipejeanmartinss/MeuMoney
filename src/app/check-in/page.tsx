import { MonthlyCheckIn } from "@/components/check-in/monthly-check-in";
import { currentReferenceMonth, referenceMonthSchema, toReferenceMonth } from "@/domain/budgets";
import { getCurrentUserMonthlyCheckin } from "@/services/finance/monthly-checkins-service";

export const metadata = { title: "Check-in financeiro" };

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; message?: string }>;
}) {
  const params = await searchParams;
  const parsedMonth = referenceMonthSchema.safeParse(params.month);
  const month = parsedMonth.success ? parsedMonth.data : currentReferenceMonth();
  const data = await getCurrentUserMonthlyCheckin(toReferenceMonth(month));
  return <MonthlyCheckIn data={data} month={month} messageCode={params.message} />;
}
