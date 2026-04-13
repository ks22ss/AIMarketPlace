import OpenAI from "openai";

export type EmbeddingClientConfig = {
  apiKey: string;
  baseUrl?: string;
  model: string;
};

export function createEmbeddingClient(config: EmbeddingClientConfig) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
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
      });

      const batchVectors = response.data
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);

      embeddings.push(...batchVectors);
    }

    return embeddings;
  }

  return { embedTexts };
}

export type EmbeddingClient = ReturnType<typeof createEmbeddingClient>;
