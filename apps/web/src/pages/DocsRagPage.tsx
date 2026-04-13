import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, FileUpIcon, SearchIcon } from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DocsQueryChunk } from "@/lib/docsClient";
import {
  ingestDocument,
  presignDocument,
  putFileToPresignedUrl,
  queryDocumentContext,
} from "@/lib/docsClient";
import { cn } from "@/lib/utils";

const textareaClass =
  "min-h-[100px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

export function DocsRagPage() {
  const { accessToken, authLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [indexedDocumentId, setIndexedDocumentId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState<number | null>(null);

  const [queryText, setQueryText] = useState("");
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DocsQueryChunk[]>([]);

  const runUploadAndIngest = useCallback(async () => {
    if (!accessToken || !file) {
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    setUploadStatus(null);
    setChunks([]);
    setIndexedDocumentId(null);
    setChunkCount(null);

    const contentType = file.type.trim() || "application/octet-stream";

    try {
      setUploadStatus("Requesting presigned URL…");
      const presign = await presignDocument(accessToken, {
        fileName: file.name,
        contentType,
      });

      setUploadStatus("Uploading to storage…");
      await putFileToPresignedUrl(presign.uploadUrl, file, contentType);

      setUploadStatus("Ingesting and embedding…");
      const ingest = await ingestDocument(accessToken, presign.documentId);

      setIndexedDocumentId(ingest.documentId);
      setChunkCount(ingest.chunkCount);
      setUploadStatus(`Ready — ${ingest.chunkCount} chunk(s) indexed.`);
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setUploadStatus(null);
    } finally {
      setUploadBusy(false);
    }
  }, [accessToken, file]);

  const runQuery = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    const trimmed = queryText.trim();
    if (!trimmed) {
      setQueryError("Enter a question.");
      return;
    }

    setQueryBusy(true);
    setQueryError(null);
    setChunks([]);

    try {
      const result = await queryDocumentContext(accessToken, {
        query: trimmed,
        limit: 8,
      });
      setChunks(result.chunks);
    } catch (error: unknown) {
      setQueryError(error instanceof Error ? error.message : "Query failed");
    } finally {
      setQueryBusy(false);
    }
  }, [accessToken, queryText]);

  return (
    <main className="flex min-h-svh flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <Button type="button" variant="ghost" size="sm" className="w-fit px-0" asChild>
              <Link to="/" className="gap-1.5 text-muted-foreground">
                <ArrowLeftIcon className="size-4" />
                Home
              </Link>
            </Button>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              Document RAG (test)
            </h1>
            <p className="text-sm text-muted-foreground">
              Upload a file → ingest on the API → ask a question → see retrieved chunks (no LLM answer yet).
            </p>
          </div>
        </div>

        {authLoading ? (
          <p className="text-sm text-muted-foreground">Checking session…</p>
        ) : null}

        {!authLoading && !accessToken ? (
          <Card>
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
              <CardDescription>Presign, ingest, and query are authenticated.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button type="button" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {!authLoading && accessToken ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileUpIcon className="size-5 opacity-80" />
                  1. Upload &amp; index
                </CardTitle>
                <CardDescription>
                  Uses <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /api/docs/presign</code>,{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">PUT</code> to the presigned URL, then{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /api/docs/ingest</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rag-file">File</Label>
                  <Input
                    id="rag-file"
                    type="file"
                    accept=".txt,.md,.pdf,.json,.html,.csv,text/*,application/pdf"
                    disabled={uploadBusy}
                    onChange={(event) => {
                      const next = event.target.files?.[0] ?? null;
                      setFile(next);
                      setUploadError(null);
                      setUploadStatus(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supported on the API today: text-like types and PDF. Large files may take a while during ingest.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    If the browser blocks the upload step, configure CORS on your S3/MinIO bucket so{" "}
                    <code className="rounded bg-muted px-0.5">PUT</code> from this app origin (e.g.{" "}
                    <code className="rounded bg-muted px-0.5">http://localhost:5173</code>) is allowed.
                  </p>
                </div>
                {uploadError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {uploadError}
                  </p>
                ) : null}
                {uploadStatus ? (
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {uploadStatus}
                  </p>
                ) : null}
                {indexedDocumentId ? (
                  <p className="text-xs text-muted-foreground">
                    Last indexed <code className="rounded bg-muted px-1">{indexedDocumentId}</code>
                    {chunkCount !== null ? ` · ${chunkCount} chunks` : null}
                  </p>
                ) : null}
              </CardContent>
              <CardFooter className="border-t bg-transparent">
                <Button type="button" onClick={() => void runUploadAndIngest()} disabled={uploadBusy || !file}>
                  {uploadBusy ? "Working…" : "Upload & index"}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SearchIcon className="size-5 opacity-80" />
                  2. Ask a question
                </CardTitle>
                <CardDescription>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /api/docs/query</code> — nearest chunks
                  for your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rag-query">Question</Label>
                  <textarea
                    id="rag-query"
                    className={cn(textareaClass)}
                    placeholder="What does the document say about…?"
                    value={queryText}
                    disabled={queryBusy}
                    onChange={(event) => setQueryText(event.target.value)}
                  />
                </div>
                {queryError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {queryError}
                  </p>
                ) : null}
                {chunks.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-foreground">Retrieved context</p>
                    <ol className="flex list-decimal flex-col gap-4 pl-4 text-sm">
                      {chunks.map((chunk, index) => (
                        <li key={`${chunk.doc_id}-${chunk.chunk_index}-${index}`} className="marker:text-muted-foreground">
                          <div className="mb-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>
                              doc <code className="rounded bg-muted px-1">{chunk.doc_id}</code>
                            </span>
                            <span>chunk #{chunk.chunk_index}</span>
                            <span>score {chunk.score.toFixed(4)}</span>
                          </div>
                          <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs text-foreground">
                            {chunk.text}
                          </pre>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="border-t bg-transparent">
                <Button type="button" onClick={() => void runQuery()} disabled={queryBusy}>
                  {queryBusy ? "Searching…" : "Retrieve context"}
                </Button>
              </CardFooter>
            </Card>

            <p className="text-center text-xs text-muted-foreground">
              API:{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                {import.meta.env.VITE_API_URL?.trim() || "same-origin /api (Vite dev proxy → http://localhost:3001)"}
              </code>
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
