import { resolveApiUrl } from "@/apiBase";

export type DocsPresignResponse = {
  uploadUrl: string;
  documentId: string;
  expiresAt: string;
  objectKey: string;
};

export type DocsIngestResponse = {
  documentId: string;
  status: "ready";
  chunkCount: number;
};

export type DocsQueryChunk = {
  text: string;
  doc_id: string;
  chunk_index: number;
  score: number;
};

export type DocsQueryResponse = {
  chunks: DocsQueryChunk[];
};

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string; detail?: string };
    const parts = [parsed.error, parsed.detail].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" — ");
    }
  } catch {
    // ignore
  }
  return text || `HTTP ${response.status}`;
}

export async function presignDocument(
  accessToken: string,
  input: { fileName: string; contentType: string },
): Promise<DocsPresignResponse> {
  const response = await fetch(resolveApiUrl("/api/docs/presign"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<DocsPresignResponse>;
}

export async function putFileToPresignedUrl(uploadUrl: string, file: File, contentType: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": contentType,
    },
  });
  if (!response.ok) {
    throw new Error(`S3 upload failed (${response.status} ${response.statusText})`);
  }
}

export async function ingestDocument(accessToken: string, documentId: string): Promise<DocsIngestResponse> {
  const response = await fetch(resolveApiUrl("/api/docs/ingest"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ documentId }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<DocsIngestResponse>;
}

export async function queryDocumentContext(
  accessToken: string,
  input: { query: string; limit?: number },
): Promise<DocsQueryResponse> {
  const response = await fetch(resolveApiUrl("/api/docs/query"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<DocsQueryResponse>;
}
