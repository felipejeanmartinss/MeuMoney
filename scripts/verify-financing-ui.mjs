// Local-only fixture of the actual client components. Actions are replaced with
// validation-only stubs: this server never connects to Supabase or writes data.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const bundled = await build({
  absWorkingDir: root, bundle: true, write: false, jsx: "automatic", platform: "browser",
  define: { "process.env.NODE_ENV": '"development"' },
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import { createRoot } from "react-dom/client";
    import { ManualFinancingForm } from "./src/components/forms/manual-financing-form";
    import { InvestmentUnitPriceForm } from "./src/components/forms/investment-unit-price-form";
    import { projectFinancingSchedule } from "./src/domain/financing-schedule";
    const contract = { id:"11111111-1111-4111-8111-111111111111", updated_at:"2026-01-01T12:00:00Z", name:"Financiamento de teste", institution:"Banco", contract_reference:"TESTE", original_principal_minor:23400000, current_balance_minor:19000000, original_term_months:360, contract_date:"2021-10-01", balance_date:"2026-09-01", nominal_annual_rate:"7.07", currency:"BRL", context:"personal", product_type:"financing", amortization_system:"SAC" };
    const schedule = projectFinancingSchedule({principalMinor:23400000,months:360,annualRate:"7,07",method:"SAC"}).map((r,i)=>({
      id:"00000000-0000-4000-8000-"+String(i+1).padStart(12,"0"), installment_number:i+1, due_date:new Date(Date.UTC(2021,10+i,1)).toISOString().slice(0,10),
      total_amount_minor:r.paymentMinor,principal_minor:r.principalMinor,interest_minor:r.interestMinor,insurance_mip_minor:0,insurance_dfi_minor:0,service_fee_minor:0,penalty_minor:0,late_interest_minor:0,
      outstanding_balance_minor:r.balanceMinor,payment_status:i===0?"paid":"scheduled",payment_date:i===0?"2021-11-01":null,paid_amount_minor:i===0?r.paymentMinor:0
    }));
    const transactions=[{id:"33333333-3333-4333-8333-333333333333",description:"Pagamento teste",transaction_date:"2021-11-01",amount_minor:202865,currency:"BRL"}];
    createRoot(document.getElementById("root")!).render(<main className="app-page"><h1>{location.pathname==="/quotes"?"Cotações":"Financiamento"}</h1>{location.pathname==="/quotes"?<InvestmentUnitPriceForm positions={[{id:"a",asset_name:"B3SA3",institution:"BTG Pactual",currency:"BRL",quantity:"100",current_value_minor:173700},{id:"b",asset_name:"BTLG11",institution:"XP",currency:"BRL",quantity:"20",current_value_minor:239280}]} />:<ManualFinancingForm contract={location.pathname==="/new"?undefined:contract} schedule={location.pathname==="/new"?[]:schedule} transactions={transactions} />}</main>);
  ` },
  plugins: [{ name: "isolated-actions", setup(builder) {
    builder.onResolve({ filter: /^@\/app\/actions\// }, (args) => ({ path: args.path, namespace: "fixture-action" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-action" }, () => ({ contents: `
      export async function createManualFinancingContract(previous, data) { window.__submittedSchedule=JSON.parse(data.get("schedule")); return {status:"error",message:"Validação local: nenhuma informação foi gravada."}; }
      export async function updateInvestmentUnitPrices() { return {status:"idle",message:"Validação local: nenhuma informação foi gravada."}; }
    ` }));
  } }],
});
const cssPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const css = (await postcss([tailwind({ base: root })]).process(await readFile(cssPath,"utf8"), { from:cssPath })).css;
const server = createServer((request,response)=>{
  if(request.url==="/bundle.js"){response.setHeader("Content-Type","text/javascript; charset=utf-8");response.end(bundled.outputFiles[0].text);}
  else if(request.url==="/style.css"){response.setHeader("Content-Type","text/css; charset=utf-8");response.end(css);}
  else {response.setHeader("Content-Type","text/html; charset=utf-8");response.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Teste local</title><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');}
});
server.listen(4317,"127.0.0.1",()=>console.log("Isolated UI fixtures: http://127.0.0.1:4317 (360 rows), /new and /quotes. No remote writes."));
