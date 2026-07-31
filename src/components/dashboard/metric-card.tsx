type MetricCardProps = {
  label: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "positive" | "negative";
};

const toneClasses = {
  neutral: "text-slate-950",
  positive: "text-emerald-700",
  negative: "text-rose-700",
};

export function MetricCard({
  label,
  value,
  helper,
  tone = "neutral",
}: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={`mt-1 break-words text-xl font-extrabold sm:text-2xl ${toneClasses[tone]}`}
      >
        {value}
      </p>
      {helper ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
      ) : null}
    </article>
  );
}
