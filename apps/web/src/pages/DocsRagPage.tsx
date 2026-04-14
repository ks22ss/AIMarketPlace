import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileUpIcon, Loader2Icon, Trash2Icon } from "lucide-react";

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
import type { DocumentSummaryDto } from "@/lib/docsClient";
import {
  deleteDocument,
  ingestDocument,
  listDocuments,
  presignDocument,
  putFileToPresignedUrl,
} from "@/lib/docsClient";

export function DocsRagPage() {
  const { accessToken, authLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [indexedDocumentId, setIndexedDocumentId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState<number | null>(null);

  const [documents, setDocuments] = useState<DocumentSummaryDto[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshDocuments = useCallback(async () => {
    if (!accessToken) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const result = await listDocuments(accessToken);
      setDocuments(result.documents);
    } catch (error: unknown) {
      setDocumentsError(error instanceof Error ? error.message : "Failed to load documents");
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  const runUploadAndIngest = useCallback(async () => {
    if (!accessToken || !file) {
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    setUploadStatus(null);
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
      await refreshDocuments();
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setUploadStatus(null);
    } finally {
      setUploadBusy(false);
    }
  }, [accessToken, file, refreshDocuments]);

  const handleDelete = useCallback(
    async (documentId: string) => {
      if (!accessToken) {
        return;
      }
      const ok = window.confirm(
        "Delete this document from the database and remove its S3 object and Weaviate vectors (when the pipeline is enabled)?",
      );
      if (!ok) {
        return;
      }
      setDeletingId(documentId);
      setDocumentsError(null);
      try {
        await deleteDocument(accessToken, documentId);
        await refreshDocuments();
      } catch (error: unknown) {
        setDocumentsError(error instanceof Error ? error.message : "Delete failed");
      } finally {
        setDeletingId(null);
      }
    },
    [accessToken, refreshDocuments],
  );

  return (
    <main className="flex min-h-full flex-1 flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              Document RAG (test)
            </h1>
            <p className="text-sm text-muted-foreground">
              Upload and index files and manage stored documents (Postgres + S3 + Weaviate). Ask questions over your
              indexed content in{" "}
              <Link to="/chat" className="font-medium text-primary underline-offset-4 hover:underline">
                Chat
              </Link>
              .
            </p>
          </div>
        </div>

        {authLoading ? (
          <p className="text-sm text-muted-foreground">Checking session…</p>
        ) : null}

        {!authLoading && accessToken ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileUpIcon className="size-5 opacity-80" />
                  Upload &amp; index
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
                <CardTitle>Your documents</CardTitle>
                <CardDescription>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">GET /api/docs</code> — Postgres row, S3 object
                  key, ingest status, and whether chunks exist in Weaviate. Delete removes the row and, when the
                  pipeline is enabled, the S3 object and vectors.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {documentsError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {documentsError}
                  </p>
                ) : null}
                {documentsLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" aria-hidden />
                    Loading documents…
                  </p>
                ) : null}
                {!documentsLoading && documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents yet. Upload one above.</p>
                ) : null}
                {!documentsLoading && documents.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {documents.map((doc) => (
                      <li
                        key={doc.document_id}
                        className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="font-medium text-foreground break-words wrap-break-word">
                              {doc.file_name ?? "Untitled"}
                            </div>
                            <div className="text-xs font-normal text-muted-foreground">
                              {doc.weaviate_indexed ? (
                                <span className="text-emerald-700 dark:text-emerald-400">Weaviate indexed</span>
                              ) : (
                                <span>Weaviate: not indexed</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">Postgres</span>{" "}
                              <code className="rounded bg-muted px-1">{doc.document_id}</code>
                              <span className="mx-1">·</span>
                              <span className="font-medium text-foreground/80">Created</span>{" "}
                              {new Date(doc.created_at).toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">S3 key</span>{" "}
                              <code className="break-all rounded bg-muted px-1">{doc.s3_object_key}</code>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/80">Ingest</span>{" "}
                              {doc.ingest_status ?? "—"}
                              {doc.chunk_count !== null ? ` · ${doc.chunk_count} chunks` : ""}
                              {doc.content_type ? ` · ${doc.content_type}` : ""}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={deletingId !== null}
                            onClick={() => void handleDelete(doc.document_id)}
                          >
                            {deletingId === doc.document_id ? (
                              <Loader2Icon className="size-4 animate-spin" aria-hidden />
                            ) : (
                              <Trash2Icon className="size-4" aria-hidden />
                            )}
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
              <CardFooter className="border-t bg-transparent">
                <Button type="button" variant="secondary" size="sm" onClick={() => void refreshDocuments()}>
                  Refresh list
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}
