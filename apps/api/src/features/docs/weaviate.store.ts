const documentChunkClass = "DocumentChunk";

export type WeaviateStoreConfig = {
  baseUrl: string;
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

  async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${base}${path}`, init);
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

  async function ensureDocumentChunkClass(): Promise<void> {
    const existing = await fetch(`${base}/v1/schema/${documentChunkClass}`);
    if (existing.ok) {
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
          { name: "doc_id", dataType: ["text"] },
          { name: "chunk_index", dataType: ["int"] },
        ],
      }),
    });
  }

  async function deleteChunksForDocument(documentId: string, userId: string): Promise<void> {
    const where: WhereFilter = {
      operator: "And",
      operands: [
        { path: ["doc_id"], operator: "Equal", valueText: documentId },
        { path: ["user_id"], operator: "Equal", valueText: userId },
      ],
    };

    const response = await fetch(`${base}/v1/batch/objects`, {
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
    userId: string;
    limit: number;
  }): Promise<Array<{ text: string; doc_id: string; chunk_index: number; distance: number }>> {
    const query = `
      query ($vector: [Float]!, $userId: String!, $limit: Int!) {
        Get {
          ${documentChunkClass}(
            nearVector: { vector: $vector }
            where: {
              path: ["user_id"]
              operator: Equal
              valueText: $userId
            }
            limit: $limit
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
          userId: params.userId,
          limit: params.limit,
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
