import OpenAI from "openai";

/** Some OpenAI-compatible providers omit `data` or use a single top-level `embedding` vector. */
function normalizeEmbeddingRows(
  response: OpenAI.Embeddings.CreateEmbeddingResponse,
  batchLength: number,
): OpenAI.Embeddings.Embedding[] {
  const rows = response.data;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows;
  }

  const loose = response as unknown as Record<string, unknown>;
  const single = loose.embedding;
  if (
    batchLength === 1 &&
    Array.isArray(single) &&
    single.length > 0 &&
    typeof single[0] === "number"
  ) {
    return [{ object: "embedding", index: 0, embedding: single as number[] }];
  }

  const nested = loose.data;
  if (Array.isArray(nested) && nested.length > 0 && typeof nested[0] === "object" && nested[0] !== null) {
    return nested as OpenAI.Embeddings.Embedding[];
  }

  return [];
}

export type EmbeddingClientConfig = {
  apiKey: string;
  baseUrl?: string;
  model: string;
  /** DeepInfra / OpenAI-compatible; default `float`. */
  encodingFormat?: "float" | "base64";
};

export function createEmbeddingClient(config: EmbeddingClientConfig) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    /** Avoid indefinite hangs when the embedding endpoint is down or misconfigured. */
    timeout: 60_000,
    maxRetries: 1,
  });

  async function embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const batchSize = 64;
    const embeddings: number[][] = [];

    for (let offset = 0; offset < texts.length; offset += batchSize) {
      const batch = texts.slice(offset, offset + batchSize);
      const response = await client.embeddings.create({
        model: config.model,
        input: batch,
        encoding_format: config.encodingFormat ?? "float",
      });

      const rows = normalizeEmbeddingRows(response, batch.length);
      if (rows.length === 0) {
        const hint = response.object ? ` object=${response.object}` : "";
        throw new Error(
          `Embeddings API returned no data array${hint} (model=${config.model}, batchSize=${batch.length}). ` +
            `Check EMBEDDING_BASE_URL (or OPENAI_BASE_URL) and EMBEDDING_MODEL / embedding API key.`,
        );
      }

      const batchVectors = [...rows]
        .map((item, position) => ({ item, position }))
        .sort(
          (left, right) =>
            (left.item.index ?? left.position) - (right.item.index ?? right.position),
        )
        .map(({ item }) => {
          if (!item.embedding || !Array.isArray(item.embedding)) {
            throw new Error(
              `Embeddings API entry missing vector (model=${config.model}, index=${String(item.index)})`,
            );
          }
          return item.embedding;
        });

      if (batchVectors.length !== batch.length) {
        throw new Error(
          `Embedding count mismatch: expected ${batch.length}, got ${batchVectors.length} (model=${config.model})`,
        );
      }

      embeddings.push(...batchVectors);
    }

    return embeddings;
  }

  return { embedTexts };
}

export type EmbeddingClient = ReturnType<typeof createEmbeddingClient>;
