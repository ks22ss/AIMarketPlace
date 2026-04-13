import { PDFParse } from "pdf-parse";

const textLike = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/html",
]);

export async function extractTextFromBuffer(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const normalizedType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (normalizedType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  if (textLike.has(normalizedType) || normalizedType.startsWith("text/")) {
    return buffer.toString("utf8").trim();
  }

  throw new Error(`Unsupported content type for ingest: ${contentType}`);
}
