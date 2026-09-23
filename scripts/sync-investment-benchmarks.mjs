import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const today = new Date();
const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
const to = option("--to", last.toISOString().slice(0, 7));
const from = option("--from", String(last.getUTCFullYear() - 10) + "-01");
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
if (!monthPattern.test(from) || !monthPattern.test(to) || from > to || to > last.toISOString().slice(0, 7)) throw new Error("Use --from e --to com meses encerrados no formato AAAA-MM.");
const dryRun = args.includes("--dry-run");
const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!dryRun && (!endpoint || !secret)) throw new Error("Configure a URL e a chave secreta de servidor do Supabase.");
const supabase = dryRun ? null : createClient(endpoint, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const syncedAt = new Date().toISOString();
const records = [];
const asMonth = (date) => { const parts = date.split("/"); if (parts.length !== 3) throw new Error("Data inválida do BCB."); return parts[2] + "-" + parts[1] + "-01"; };
const validate = (row) => {
  if (!["cdi", "selic", "ipca", "usd", "ibovespa", "ifix"].includes(row.code) || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(row.reference_month)
    || !Number.isFinite(row.return_percent) || row.return_percent < -100 || row.return_percent > 100000 || !row.source) throw new Error("Observação de benchmark inválida.");
  return { ...row, synced_at: syncedAt };
};
async function bcb(series, start, end) {
  const [year, month] = end.split("-").map(Number);
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const query = new URLSearchParams({ formato: "json", dataInicial: "01/" + start.slice(5) + "/" + start.slice(0, 4), dataFinal: finalDay + "/" + end.slice(5) + "/" + end.slice(0, 4) });
  const response = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs." + series + "/dados?" + query, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("BCB " + series + ": HTTP " + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error("BCB " + series + ": série vazia.");
  return rows;
}
for (const [code, series] of [["cdi", 4391], ["selic", 4390], ["ipca", 433]]) {
  const rows = await bcb(series, from, to);
  for (const row of rows) records.push(validate({ code, reference_month: asMonth(row.data), return_percent: Number(row.valor.replace(",", ".")), source: "BCB/SGS " + series }));
}
const previous = new Date(from + "-01T12:00:00Z"); previous.setUTCMonth(previous.getUTCMonth() - 1);
const usd = (await bcb(3696, previous.toISOString().slice(0, 7), to)).map((row) => ({ month: asMonth(row.data), value: Number(row.valor.replace(",", ".")) })).sort((a, b) => a.month.localeCompare(b.month));
for (let i = 1; i < usd.length; i++) {
  const expected = new Date(usd[i - 1].month + "T12:00:00Z"); expected.setUTCMonth(expected.getUTCMonth() + 1);
  if (expected.toISOString().slice(0, 10) !== usd[i].month || usd[i - 1].value <= 0 || usd[i].value <= 0) throw new Error("Lacuna ou cotação inválida na série do dólar.");
  records.push(validate({ code: "usd", reference_month: usd[i].month, return_percent: Number(((usd[i].value / usd[i - 1].value - 1) * 100).toFixed(8)), source: "BCB/SGS 3696 (PTAX venda, fim do mês)" }));
}
const b3File = option("--b3-json", null);
if (b3File) {
  const rows = JSON.parse(await readFile(b3File, "utf8"));
  if (!Array.isArray(rows)) throw new Error("O arquivo B3 deve conter uma lista JSON.");
  for (const row of rows) {
    if (!["ibovespa", "ifix"].includes(row.code)) throw new Error("O arquivo B3 aceita somente Ibovespa e IFIX.");
    if (row.return_percent == null || String(row.return_percent).trim() === "") throw new Error("Informe o retorno mensal; valores ausentes não são zero.");
    records.push(validate({ code: row.code, reference_month: row.reference_month, return_percent: Number(row.return_percent), source: row.source }));
  }
}
const scoped = records.filter((row) => row.reference_month >= from + "-01" && row.reference_month <= to + "-01");
if (new Set(scoped.map((row) => row.code + ":" + row.reference_month)).size !== scoped.length) throw new Error("A série contém meses duplicados.");
// Requiring complete BCB coverage prevents replacing a valid dataset with partial input.
for (const code of ["cdi", "selic", "ipca", "usd"]) {
  for (let month = new Date(from + "-01T12:00:00Z"); month.toISOString().slice(0, 7) <= to; month.setUTCMonth(month.getUTCMonth() + 1)) {
    if (!scoped.some((row) => row.code === code && row.reference_month === month.toISOString().slice(0, 10))) throw new Error("Falta referência: " + code + " " + month.toISOString().slice(0, 7));
  }
}
if (supabase) {
  const { error } = await supabase.from("investment_benchmark_months").upsert(scoped, { onConflict: "code,reference_month" });
  if (error) throw new Error("Falha ao gravar benchmarks: " + error.message);
}
console.log((dryRun ? "Validadas" : "Sincronizadas") + ": " + scoped.length + " observações mensais (" + from + " a " + to + ").");
if (!b3File) console.log("Ibovespa e IFIX: aguardando histórico de fonte autorizada; não foram estimados.");
