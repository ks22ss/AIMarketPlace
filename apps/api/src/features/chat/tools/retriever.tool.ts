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
 * LangChain tool: semantic search over the current user's department indexed chunks.
 * Pass `config.configurable.departmentId` at invoke time (trusted server-side id).
 */
export function createRetrieverTool(pipeline: DocumentPipeline, chunkLimit: number = defaultChunkLimit) {
  return tool(
    async (input: { query: string }, config) => {
      const departmentId = config?.configurable?.departmentId as string | undefined;
      if (!departmentId) {
        throw new Error("retrieve_documents requires configurable.departmentId");
      }
      const chunks = await pipeline.queryContext({
        departmentId,
        query: input.query,
        limit: chunkLimit,
      });
      return formatChunks(chunks);
    },
    {
      name: "retrieve_documents",
      description:
        "Search this department's uploaded documents for passages relevant to a search query. " +
        "Returns excerpt text with doc and chunk ids. Use before answering factual questions about internal files.",
      schema: z.object({
        query: z.string().min(1).max(2000).describe("Search query derived from the user's question"),
      }),
    },
  );
}
