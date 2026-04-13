import { PDFParse } from "pdf-parse";

/** When S3 returns a generic MIME type, use presign metadata or file extension. */
export function resolveIngestContentType(params: {
  s3ContentType: string;
  storedContentType: string;
  fileName: string;
}): string {
  const s3Base = params.s3ContentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const storedBase = params.storedContentType.split(";")[0]?.trim().toLowerCase() ?? "";

  const isGeneric = (mime: string): boolean =>
    mime === "" || mime === "application/octet-stream" || mime === "binary/octet-stream";

  if (!isGeneric(s3Base)) {
    return params.s3ContentType.split(";")[0]?.trim() ?? params.s3ContentType;
  }
  if (!isGeneric(storedBase)) {
    return params.storedContentType.split(";")[0]?.trim() ?? params.storedContentType;
  }

  const fromName = sniffContentTypeFromFileName(params.fileName);
  if (fromName) {
    return fromName;
  }

  return params.storedContentType.split(";")[0]?.trim() || params.s3ContentType || "application/octet-stream";
}

function sniffContentTypeFromFileName(fileName: string): string | null {
  const base = fileName.split(/[/\\]/).pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() ?? "" : "";
  switch (ext) {
    case "txt":
      return "text/plain";
    case "md":
    case "markdown":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "xml":
      return "application/xml";
    case "html":
    case "htm":
      return "text/html";
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}

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
