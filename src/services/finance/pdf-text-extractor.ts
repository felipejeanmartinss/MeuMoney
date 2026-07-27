import type { PdfTextDocument, PdfTextPage } from "../../domain/pdf-imports";
import { PdfImportError } from "../../domain/pdf-imports";

type PositionedText = {
  text: string;
  x: number;
  y: number;
};

function linesFromPositionedText(items: PositionedText[]): string[] {
  const rows: Array<{ y: number; items: PositionedText[] }> = [];

  for (const item of [...items].sort(
    (left, right) => right.y - left.y || left.x - right.x,
  )) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
    if (row) {
      row.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) =>
      row.items
        .sort((left, right) => left.x - right.x)
        .map((item) => item.text.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

export function classifyPdfExtractionError(error: unknown) {
  const candidate =
    typeof error === "object" && error !== null
      ? (error as { name?: string; message?: string; code?: number })
      : null;
  const name = candidate?.name?.toLowerCase() ?? "";
  const message = candidate?.message?.toLowerCase() ?? "";

  if (
    name.includes("password") ||
    message.includes("password") ||
    message.includes("senha")
  ) {
    return new PdfImportError(
      "protected",
      "O PDF está protegido por senha. Exporte uma cópia sem proteção.",
    );
  }

  return new PdfImportError(
    "incompatible",
    "O arquivo não é um PDF válido ou usa recursos incompatíveis.",
  );
}

export async function extractSearchablePdfText(
  bytes: Uint8Array,
): Promise<PdfTextDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    stopAtErrors: true,
    useSystemFonts: true,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  try {
    const document = await loadingTask.promise;
    const pages: PdfTextPage[] = [];

    try {
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const positioned = content.items.flatMap((item) => {
          if (!("str" in item) || !item.str.trim()) return [];
          return [
            {
              text: item.str,
              x: item.transform[4],
              y: item.transform[5],
            },
          ];
        });
        pages.push({
          pageNumber,
          lines: linesFromPositionedText(positioned),
        });
        page.cleanup();
      }
    } finally {
      await document.cleanup();
    }

    return { pageCount: pages.length, pages };
  } catch (error) {
    throw classifyPdfExtractionError(error);
  } finally {
    await loadingTask.destroy();
  }
}
