# Document write path (upload → object storage → ingest)

This doc walks the **document write path**: creating a `Document` row, uploading bytes to S3-compatible storage, then **ingesting** (extract → chunk → embed → Weaviate + Postgres metadata). It uses the same alternating pattern as `docs/chat.md`:

- description
- code snippet

---

## 0) Preconditions

**Description**

The document pipeline must be wired at API startup (`createDocumentPipelineFromEnv` in `apps/api/src/index.ts`). If S3, Weaviate, or embedding configuration is missing or bootstrap fails, `deps.pipeline` is `null` and **`POST /api/docs/presign`** and **`POST /api/docs/ingest`** return **503** with a “pipeline not configured” style message (see `respondPipelineDisabled` in `apps/api/src/features/docs/docs.routes.ts`).

---

## 1) Web UI: presign → PUT → ingest

**Description**

The Documents RAG page runs three steps in order: request a presigned upload URL (and new `documentId`), `PUT` the file bytes to that URL (direct to MinIO/S3, not through the API), then call ingest so the API reads the object back, chunks, embeds, and writes vectors.

**Code snippet** (`apps/web/src/pages/DocsRagPage.tsx`)

```ts
const presign = await presignDocument(accessToken, {
  fileName: file.name,
  contentType,
});

await putFileToPresignedUrl(presign.uploadUrl, file, contentType);

const ingest = await ingestDocument(accessToken, presign.documentId);
```

---

## 2) Client: `POST /api/docs/presign`

**Description**

`presignDocument` sends JSON `{ fileName, contentType }` with the JWT. The API validates the body, resolves the user’s org, and delegates to the pipeline’s `createPresignedUpload`, which creates the `Document` row and returns a time-limited `PUT` URL.

**Code snippet** (`apps/web/src/lib/docsClient.ts`)

```ts
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
```

---

## 3) API route: presign handler → pipeline

**Description**

`POST /api/docs/presign` requires auth and a non-null pipeline. It loads the user for `orgId`, then calls `pipeline.createPresignedUpload`. The response includes `uploadUrl`, `documentId`, `expiresAt`, and `objectKey` (same key stored on `Document.s3Url`).

**Code snippet** (`apps/api/src/features/docs/docs.routes.ts`)

```ts
const created = await deps.pipeline.createPresignedUpload({
  userId: authUser.userId,
  orgId: user.orgId,
  departmentId: user.departmentId,
  fileName: parsed.data.fileName,
  contentType: parsed.data.contentType,
});

const payload: DocsPresignResponse = {
  uploadUrl: created.uploadUrl,
  documentId: created.documentId,
  expiresAt: created.expiresAt,
  objectKey: created.objectKey,
};
response.json(payload);
```

---

## 4) Pipeline: create DB row + presigned PUT URL

**Description**

`createPresignedUpload` allocates a new `documentId` (UUID), builds an S3 object key `{org}/{user}/{docId}/{safeFileName}`, presigns a `PUT` for that key, and inserts a **`Document`** row with `metadata.ingestStatus: "awaiting_upload"` until ingest completes.

**Code snippet** (`apps/api/src/features/docs/document.pipeline.ts`)

```ts
const documentId = randomUUID();
const objectKey = buildObjectKey({
  orgId: input.orgId,
  userId: input.userId,
  documentId,
  fileName: input.fileName,
});

const uploadUrl = await deps.s3.presignPutObject({
  objectKey,
  contentType: input.contentType,
  expiresSeconds: 15 * 60,
});

await deps.prisma.document.create({
  data: {
    docId: documentId,
    userId: input.userId,
    departmentId: input.departmentId,
    orgId: input.orgId,
    s3Url: objectKey,
    metadata: {
      fileName: input.fileName,
      contentType: input.contentType,
      ingestStatus: "awaiting_upload",
    },
  },
});
```

---

## 5) Client: `PUT` file to the presigned URL

**Description**

The browser uploads the raw `File` to the presigned URL (MinIO locally). The API is not in the data path for the bytes. A non-2xx response surfaces as an upload error in the UI.

**Code snippet** (`apps/web/src/lib/docsClient.ts`)

```ts
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
```

---

## 6) Client: `POST /api/docs/ingest`

**Description**

After the object exists in S3, `ingestDocument` calls **`POST /api/docs/ingest`** with `{ documentId }` (UUID). The API verifies auth and pipeline, then runs `pipeline.ingestDocument`, which is where text extraction, chunking, embedding, and Weaviate writes happen.

**Code snippet** (`apps/web/src/lib/docsClient.ts`)

```ts
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
```

---

## 7) API route: ingest handler

**Description**

The ingest route parses `documentId`, requires the pipeline, and delegates to `ingestDocument`. Mapping turns common pipeline errors (forbidden, not found, bad content) into **4xx** responses; otherwise **500** on unexpected failures.

**Code snippet** (`apps/api/src/features/docs/docs.routes.ts`)

```ts
const result = await deps.pipeline.ingestDocument({
  userId: authUser.userId,
  departmentId: authUser.departmentId,
  documentId: parsed.data.documentId,
});

const payload: DocsIngestResponse = {
  documentId: result.documentId,
  status: result.status,
  chunkCount: result.chunkCount,
};
response.json(payload);
```

---

## 8) Pipeline: read S3 → extract → chunk → embed → Weaviate → Postgres

**Description**

`ingestDocument` loads the `Document` by `documentId`, checks **owner** and **department**, downloads the object from S3, resolves MIME for extraction, turns the buffer into text, splits with `chunkText`, embeds all chunks, **replaces** any existing Weaviate chunks for that document, inserts new chunk objects with vectors, and updates Prisma metadata to `ingestStatus: "ready"` plus `chunkCount` (and resolved `contentType`).

**Code snippet** (`apps/api/src/features/docs/document.pipeline.ts`)

```ts
const { buffer, contentType: s3ContentType } = await deps.s3.getObjectBuffer(document.s3Url);
const resolvedType = resolveIngestContentType({ s3ContentType, storedContentType, fileName });

const text = await extractTextFromBuffer(buffer, resolvedType);
const chunks = chunkText(text);

const vectors = await deps.embeddings.embedTexts(chunks);

await deps.weaviate.deleteChunksForDocument(document.docId);

await deps.weaviate.insertChunks(
  chunks.map((chunk, index) => ({
    vector: vectors[index] ?? [],
    text: chunk,
    userId: ownerId,
    orgId: orgIdValue,
    departmentId: document.departmentId,
    documentId: document.docId,
    chunkIndex: index,
  })),
);

await deps.prisma.document.update({
  where: { docId: document.docId },
  data: {
    metadata: {
      ...metadata,
      ingestStatus: "ready",
      chunkCount: chunks.length,
      contentType: resolvedType,
    },
  },
});
```

---

## 9) After write: listing (read path touchpoint)

**Description**

`GET /api/docs` returns summaries for documents in the user’s **department**, including `ingest_status`, `chunk_count`, and `weaviate_indexed` derived from metadata. That is how the UI confirms the write + ingest completed.

**Code snippet** (`apps/api/src/features/docs/docs.routes.ts`)

```ts
const rows = await deps.prisma.document.findMany({
  where: { departmentId: authUser.departmentId },
  orderBy: { createdAt: "desc" },
});
// ... maps rows to DocumentSummaryDto including ingest_status / weaviate_indexed ...
```

---

## Contract reference (request bodies)

**Description**

Public request shapes live in `apps/api/src/contracts/public-api.ts` (and are mirrored loosely by the web client).

**Code snippet** (`apps/api/src/contracts/public-api.ts`)

```ts
export const docsPresignBodySchema = z.object({
  fileName: z.string().min(1).max(512),
  contentType: z.string().min(1).max(256),
});

export const docsIngestBodySchema = z.object({
  documentId: z.string().uuid(),
});
```
