const documentChunkClass = "DocumentChunk";

/** UUID-shaped string safe to inline in GraphQL (hex + hyphens only). */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertFilterUserId(value: string): string {
  if (!uuidPattern.test(value)) {
    throw new Error("Invalid user id for Weaviate filter");
  }
  return value;
}

function clampGetLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 8;
  }
  return Math.min(100, Math.max(1, Math.floor(value)));
}

export type WeaviateStoreConfig = {
  baseUrl: string;
  /** Per-request HTTP timeout (ms). Prevents hung chat when Weaviate is unreachable. */
  requestTimeoutMs?: number;
};

type WhereFilter =
  | {
      path: string[];
      operator: string;
      valueText: string;
    }
  | {
      operator: "And" | "Or";
      operands: WhereFilter[];
    };

export function createWeaviateStore(config: WeaviateStoreConfig) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const requestTimeoutMs = config.requestTimeoutMs ?? 45_000;

  async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Weaviate request timed out after ${Math.round(requestTimeoutMs / 1000)}s (${url})`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetchWithTimeout(`${base}${path}`, init);
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      throw new Error(
        `Weaviate request failed (${response.status} ${response.statusText}): ${typeof body === "string" ? body : JSON.stringify(body)}`,
      );
    }
    return body;
  }

  async function ensureDepartmentIdProperty(): Promise<void> {
    const existing = await fetchWithTimeout(`${base}/v1/schema/${documentChunkClass}`);
    if (!existing.ok) {
      return;
    }
    const schema = (await existing.json()) as { properties?: { name: string }[] };
    const hasDept = schema.properties?.some((p) => p.name === "department_id") ?? false;
    if (hasDept) {
      return;
    }
    try {
      await requestJson(`/v1/schema/${documentChunkClass}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "department_id", dataType: ["text"] }),
      });
    } catch (error) {
      console.warn("weaviate: could not add department_id property (may already exist)", error);
    }
  }

  async function ensureDocumentChunkClass(): Promise<void> {
    const existing = await fetchWithTimeout(`${base}/v1/schema/${documentChunkClass}`);
    if (existing.ok) {
      await ensureDepartmentIdProperty();
      return;
    }

    await requestJson("/v1/schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class: documentChunkClass,
        vectorizer: "none",
        vectorIndexConfig: { distance: "cosine" },
        properties: [
          { name: "text", dataType: ["text"] },
          { name: "user_id", dataType: ["text"] },
          { name: "org_id", dataType: ["text"] },
          { name: "department_id", dataType: ["text"] },
          { name: "doc_id", dataType: ["text"] },
          { name: "chunk_index", dataType: ["int"] },
        ],
      }),
    });
    await ensureDepartmentIdProperty();
  }

  async function deleteChunksForDocument(documentId: string): Promise<void> {
    const where: WhereFilter = {
      path: ["doc_id"],
      operator: "Equal",
      valueText: documentId,
    };

    const response = await fetchWithTimeout(`${base}/v1/batch/objects`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match: {
          class: documentChunkClass,
          where,
        },
      }),
    });

    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`Weaviate delete failed (${response.status}): ${text}`);
    }
  }

  async function insertChunks(
    items: Array<{
      vector: number[];
      text: string;
      userId: string;
      orgId: string;
      departmentId: string;
      documentId: string;
      chunkIndex: number;
    }>,
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const objects = items.map((item) => ({
      class: documentChunkClass,
      properties: {
        text: item.text,
        user_id: item.userId,
        org_id: item.orgId,
        department_id: item.departmentId,
        doc_id: item.documentId,
        chunk_index: item.chunkIndex,
      },
      vector: item.vector,
    }));

    await requestJson("/v1/batch/objects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objects }),
    });
  }

  async function queryNearest(params: {
    vector: number[];
    departmentId: string;
    limit: number;
  }): Promise<Array<{ text: string; doc_id: string; chunk_index: number; distance: number }>> {
    const safeDepartmentId = assertFilterUserId(params.departmentId);
    const safeLimit = clampGetLimit(params.limit);

    // Weaviate 1.27+ GraphQL: `where.valueText` is typed per-class; String! variables are rejected.
    // Inline validated UUID + limit; keep only the embedding vector as a variable.
    const query = `
      query ($vector: [Float]!) {
        Get {
          ${documentChunkClass}(
            nearVector: { vector: $vector }
            where: {
              path: ["department_id"]
              operator: Equal
              valueText: "${safeDepartmentId}"
            }
            limit: ${safeLimit}
          ) {
            text
            doc_id
            chunk_index
            _additional {
              distance
            }
          }
        }
      }
    `;

    const body = (await requestJson("/v1/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          vector: params.vector,
        },
      }),
    })) as {
      data?: {
        Get?: {
          DocumentChunk?: Array<{
            text: string;
            doc_id: string;
            chunk_index: number;
            _additional?: { distance?: number };
          }>;
        };
      };
      errors?: unknown;
    };

    if (body.errors) {
      throw new Error(`Weaviate GraphQL error: ${JSON.stringify(body.errors)}`);
    }

    const rows = body.data?.Get?.DocumentChunk ?? [];
    return rows.map((row) => ({
      text: row.text,
      doc_id: row.doc_id,
      chunk_index: row.chunk_index,
      distance: row._additional?.distance ?? 0,
    }));
  }

  return {
    ensureDocumentChunkClass,
    deleteChunksForDocument,
    insertChunks,
    queryNearest,
  };
}

export type WeaviateStore = ReturnType<typeof createWeaviateStore>;
