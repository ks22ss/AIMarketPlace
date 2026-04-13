import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { DocumentPipeline } from "../../docs/document.pipeline.js";

const defaultChunkLimit = 8;

function formatChunks(
  chunks: Array<{ text: string; doc_id: string; chunk_index: number; score: number }>,
): string {
  if (chunks.length === 0) {
    return "No matching document passages were found.";
  }
  return chunks
    .map(
      (chunk, index) =>
        `[#${index + 1}] doc_id=${chunk.doc_id} chunk=${chunk.chunk_index} score=${chunk.score.toFixed(4)}\n${chunk.text}`,
    )
    .join("\n\n---\n\n");
}

/**
 * LangChain tool: semantic search over the current user's indexed chunks.
 * Pass `config.configurable.userId` at invoke time (trusted server-side id).
 */
export function createRetrieverTool(pipeline: DocumentPipeline, chunkLimit: number = defaultChunkLimit) {
  return tool(
    async (input: { query: string }, config) => {
      const userId = config?.configurable?.userId as string | undefined;
      if (!userId) {
        throw new Error("retrieve_documents requires configurable.userId");
      }
      const chunks = await pipeline.queryContext({
        userId,
        query: input.query,
        limit: chunkLimit,
      });
      return formatChunks(chunks);
    },
    {
      name: "retrieve_documents",
      description:
        "Search the signed-in user's uploaded documents for passages relevant to a search query. " +
        "Returns excerpt text with doc and chunk ids. Use before answering factual questions about their files.",
      schema: z.object({
        query: z.string().min(1).max(2000).describe("Search query derived from the user's question"),
      }),
    },
  );
}
