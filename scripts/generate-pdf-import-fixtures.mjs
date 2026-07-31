import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const fixtureDirectory = resolve("tests", "fixtures", "imports");

function escapePdfText(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function pageStream(lines) {
  if (lines.some((line) => typeof line !== "string")) {
    return lines
      .map(
        (item) =>
          `BT\n/F1 10 Tf\n1 0 0 1 ${item.x} ${item.y} Tm\n(${escapePdfText(item.text)}) Tj\nET`,
      )
      .join("\n");
  }
  const textCommands = lines
    .map((line, index) =>
      index === 0
        ? `(${escapePdfText(line)}) Tj`
        : `T* (${escapePdfText(line)}) Tj`,
    )
    .join("\n");
  return `BT\n/F1 10 Tf\n48 744 Td\n14 TL\n${textCommands}\nET`;
}

function createSearchablePdf(pages) {
  const fontObjectId = 3;
  const firstPageObjectId = 4;
  const firstContentObjectId = firstPageObjectId + pages.length;
  const objects = new Map();
  const pageReferences = pages
    .map((_, index) => `${firstPageObjectId + index} 0 R`)
    .join(" ");

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageReferences}] /Count ${pages.length} >>`,
  );
  objects.set(
    fontObjectId,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  );

  pages.forEach((lines, index) => {
    const pageObjectId = firstPageObjectId + index;
    const contentObjectId = firstContentObjectId + index;
    const stream = pageStream(lines);
    objects.set(
      pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    );
    objects.set(
      contentObjectId,
      `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
    );
  });

  const lastObjectId = firstContentObjectId + pages.length - 1;
  let output = "%PDF-1.4\n% ANONYMOUS TEST FIXTURE\n";
  const offsets = [0];

  for (let objectId = 1; objectId <= lastObjectId; objectId += 1) {
    offsets[objectId] = Buffer.byteLength(output, "ascii");
    output += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${lastObjectId + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let objectId = 1; objectId <= lastObjectId; objectId += 1) {
    output += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${lastObjectId + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

mkdirSync(fixtureDirectory, { recursive: true });

writeFileSync(
  resolve(fixtureDirectory, "anonymous-fixture-bank-statement-v1.pdf"),
  createSearchablePdf([
    [
      "BANCO EXEMPLO",
      "EXTRATO DE CONTA",
      "PERIODO 01/03/2026 A 31/03/2026",
      "DATA DESCRICAO VALOR",
      "01/03/2026 MERCADO EXEMPLO -123,45",
      "02/03/2026 PAGAMENTO CLIENTE 1.250,00",
    ],
    [
      "BANCO EXEMPLO",
      "EXTRATO DE CONTA",
      "DATA DESCRICAO VALOR",
      "03/03/2026 TARIFA EXEMPLO -15,90",
    ],
  ]),
);

writeFileSync(
  resolve(fixtureDirectory, "anonymous-scanned-placeholder.pdf"),
  createSearchablePdf([[]]),
);

writeFileSync(
  resolve(
    fixtureDirectory,
    "anonymous-bradesco-account-statement-v1.pdf",
  ),
  createSearchablePdf([
    [
      { text: "BRADESCO EMPRESA", x: 46, y: 760 },
      { text: "EXTRATO DE CONTA", x: 46, y: 730 },
      { text: "DATA", x: 46, y: 681 },
      { text: "HISTORICO", x: 111, y: 681 },
      { text: "DOCTO.", x: 305, y: 681 },
      { text: "CREDITO (R$)", x: 385, y: 681 },
      { text: "DEBITO (R$)", x: 452, y: 681 },
      { text: "SALDO (R$)", x: 520, y: 681 },
      { text: "01/07/2026", x: 46, y: 645 },
      { text: "TRANSFERENCIA RECEBIDA", x: 110, y: 645 },
      { text: "100001", x: 303, y: 645 },
      { text: "1.250,00", x: 413, y: 645 },
      { text: "2.250,00", x: 523, y: 645 },
      { text: "02/07/2026", x: 46, y: 614 },
      { text: "PAGAMENTO DE CONTA", x: 110, y: 610 },
      { text: "100002", x: 303, y: 614 },
      { text: "245,90", x: 463, y: 614 },
      { text: "2.004,10", x: 523, y: 614 },
      { text: "03/07/2026", x: 46, y: 579 },
      { text: "SALDO C/C P/PROX DIA", x: 110, y: 575 },
      { text: "100003", x: 303, y: 579 },
      { text: "2.004,10", x: 413, y: 579 },
      { text: "2.004,10", x: 523, y: 579 },
    ],
  ]),
);

writeFileSync(
  resolve(fixtureDirectory, "anonymous-nubank-account-statement-v1.pdf"),
  createSearchablePdf([
    [
      { text: "NUBANK.COM.BR", x: 57, y: 760 },
      { text: "SALDO INICIAL DO PERIODO", x: 57, y: 645 },
      { text: "01 JUL 2026", x: 58, y: 539 },
      { text: "TOTAL DE ENTRADAS", x: 120, y: 539 },
      { text: "+ 1.250,00", x: 490, y: 539 },
      { text: "PIX RECEBIDO", x: 120, y: 518 },
      { text: "1.250,00", x: 498, y: 518 },
      { text: "TOTAL DE SAIDAS", x: 120, y: 484 },
      { text: "- 98,70", x: 492, y: 484 },
      { text: "TRANSFERENCIA ENVIADA VIA PIX", x: 120, y: 463 },
      { text: "98,70", x: 498, y: 463 },
      { text: "DESTINATARIO ANONIMO", x: 262, y: 443 },
    ],
    [
      { text: "NUBANK.COM.BR", x: 57, y: 760 },
      { text: "TOTAL DE ENTRADAS", x: 120, y: 690 },
      { text: "+ 300,00", x: 490, y: 690 },
      { text: "02 JUL 2026", x: 58, y: 669 },
      { text: "TRANSFERENCIA RECEBIDA", x: 120, y: 669 },
      { text: "300,00", x: 498, y: 669 },
      { text: "TOTAL DE SAIDAS", x: 120, y: 640 },
      { text: "- 75,90", x: 492, y: 640 },
      { text: "PAGAMENTO DE BOLETO", x: 120, y: 619 },
      { text: "75,90", x: 498, y: 619 },
      { text: "SALDO FINAL DO PERIODO", x: 57, y: 580 },
    ],
  ]),
);

writeFileSync(
  resolve(fixtureDirectory, "anonymous-incompatible.pdf"),
  Buffer.from("This is intentionally not a PDF.", "utf8"),
);
