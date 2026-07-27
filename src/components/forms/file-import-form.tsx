"use client";

import { useActionState, useState } from "react";
import {
  uploadFinancialFile,
  type FileImportFormState,
} from "@/app/actions/file-imports";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: FileImportFormState = { status: "idle" };

export function FileImportForm() {
  const [fileType, setFileType] = useState<"csv" | "ofx" | "pdf">("csv");
  const [state, formAction, pending] = useActionState(
    uploadFinancialFile,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-6">
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Formato" error={state.fieldErrors?.fileType?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.fileType))}
            name="fileType"
            value={fileType}
            onChange={(event) =>
              setFileType(event.target.value as "csv" | "ofx" | "pdf")
            }
          >
            <option value="csv">CSV configurável</option>
            <option value="ofx">OFX estruturado</option>
            <option value="pdf">PDF pesquisável</option>
          </select>
        </Field>

        <Field label="Arquivo" error={state.fieldErrors?.file?.[0]}>
          <input
            className={`${inputClass(Boolean(state.fieldErrors?.file))} py-2`}
            name="file"
            type="file"
            accept={
              fileType === "csv"
                ? ".csv,text/csv"
                : fileType === "ofx"
                  ? ".ofx"
                  : ".pdf,application/pdf"
            }
            required
          />
          <span className="text-xs font-normal text-slate-500">
            Até 5 MB e 1.000 movimentações. O arquivo original não é
            armazenado.
          </span>
          {fileType === "pdf" ? (
            <span className="text-xs font-normal text-amber-700">
              Apenas PDFs com texto pesquisável e layouts listados como
              suportados. Arquivos protegidos ou digitalizados sem OCR serão
              recusados.
            </span>
          ) : null}
        </Field>
      </div>

      {fileType === "csv" ? (
        <fieldset className="grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <legend className="font-bold text-slate-950">
            Como ler este CSV
          </legend>
          <p className="-mt-3 text-sm text-slate-600">
            Informe a posição das colunas contando da esquerda para a direita.
            A primeira coluna é 1.
          </p>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              label="Coluna da data"
              error={state.fieldErrors?.dateColumn?.[0]}
            >
              <input
                className={inputClass(Boolean(state.fieldErrors?.dateColumn))}
                name="dateColumn"
                type="number"
                min="1"
                max="100"
                defaultValue="1"
                required
              />
            </Field>
            <Field
              label="Coluna da descrição"
              error={state.fieldErrors?.descriptionColumn?.[0]}
            >
              <input
                className={inputClass(
                  Boolean(state.fieldErrors?.descriptionColumn),
                )}
                name="descriptionColumn"
                type="number"
                min="1"
                max="100"
                defaultValue="2"
                required
              />
            </Field>
            <Field
              label="Coluna do valor"
              error={state.fieldErrors?.amountColumn?.[0]}
            >
              <input
                className={inputClass(
                  Boolean(state.fieldErrors?.amountColumn),
                )}
                name="amountColumn"
                type="number"
                min="1"
                max="100"
                defaultValue="3"
                required
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Separador de colunas"
              error={state.fieldErrors?.delimiter?.[0]}
            >
              <select
                className={inputClass(Boolean(state.fieldErrors?.delimiter))}
                name="delimiter"
                defaultValue=";"
              >
                <option value=";">Ponto e vírgula (;)</option>
                <option value=",">Vírgula (,)</option>
                <option value="tab">Tabulação</option>
                <option value="|">Barra vertical (|)</option>
              </select>
            </Field>
            <Field
              label="Formato da data"
              error={state.fieldErrors?.dateFormat?.[0]}
            >
              <select
                className={inputClass(Boolean(state.fieldErrors?.dateFormat))}
                name="dateFormat"
                defaultValue="DD/MM/YYYY"
              >
                <option value="DD/MM/YYYY">DD/MM/AAAA</option>
                <option value="YYYY-MM-DD">AAAA-MM-DD</option>
                <option value="MM/DD/YYYY">MM/DD/AAAA</option>
              </select>
            </Field>
            <Field
              label="Separador decimal"
              error={state.fieldErrors?.decimalSeparator?.[0]}
            >
              <select
                className={inputClass(
                  Boolean(state.fieldErrors?.decimalSeparator),
                )}
                name="decimalSeparator"
                defaultValue=","
              >
                <option value=",">Vírgula (1.234,56)</option>
                <option value=".">Ponto (1,234.56)</option>
              </select>
            </Field>
            <Field
              label="Linhas antes do cabeçalho"
              error={state.fieldErrors?.skipRows?.[0]}
            >
              <input
                className={inputClass(Boolean(state.fieldErrors?.skipRows))}
                name="skipRows"
                type="number"
                min="0"
                max="20"
                defaultValue="0"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <input
                type="checkbox"
                name="hasHeader"
                value="true"
                defaultChecked
                className="mt-1 size-4"
              />
              <span>
                <strong className="block text-slate-950">
                  A primeira linha contém títulos
                </strong>
                Ela será usada apenas como cabeçalho e não será importada.
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <input
                type="checkbox"
                name="invertAmountSign"
                value="true"
                className="mt-1 size-4"
              />
              <span>
                <strong className="block text-slate-950">
                  Inverter o sinal dos valores
                </strong>
                Use quando o banco exporta despesas positivas e receitas
                negativas.
              </span>
            </label>
          </div>
        </fieldset>
      ) : (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
          O leitor aceita blocos estruturados <code>STMTTRN</code>, incluindo
          OFX SGML e XML. Data, valor, identificador e descrição serão
          normalizados para a prévia.
        </div>
      )}

      <SubmitButton pending={pending}>
        Ler arquivo e preparar prévia
      </SubmitButton>
    </form>
  );
}
