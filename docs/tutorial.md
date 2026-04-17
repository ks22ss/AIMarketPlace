# Tutorial: Nodes, prompt templates, and skills

This guide explains how to use the **Node builder** and **Skill builder** in the web app, how the chat runtime uses your work, and how to design effective workflows.

---

## 1. Concepts: nodes vs skills

| Concept | What it is |
|--------|------------|
| **Node** | A reusable **prompt template** stored for your organization. It has a unique **`snake_case` name** and a **Prompt template** body. Nodes can optionally be restricted by department and role (same idea as skills). |
| **Skill** | An **ordered list of node names** (workflow steps). Chat runs that sequence when the user selects the skill and sends a message. Skills can also have allow lists for who may use them. |

You **create nodes first**, then **compose a skill** that references those node names in order.

---

## 2. Node builder: the input panel

Open **Node builder** in the app. You will see:

1. **Who can use this node (optional)** — Department and role checkboxes. If you leave them all unchecked, everyone in the organization who can see the node may use it (subject to skill-level rules later).
2. **Name** — Lowercase **`snake_case`** only (letters, numbers, underscores; must match the pattern `like_this`). This string is what you pick later in the Skill builder. The reserved name **`retrieve_documents`** cannot be used; it is a system step, not a user-defined node.
3. **Description (optional)** — A short human-readable label for builders; not sent to the model as part of the prompt unless you put it in the template yourself.
4. **Prompt template** — The main text sent to the language model for this step, after placeholders are filled in (see §4).

The large text area is your **prompt template**. You control the structure: headings, instructions, and where **`{{query}}`**, **`{{context}}`**, and **`{{output}}`** appear. There is no forced layout; only the placeholders you include are substituted.

After saving, the node appears under **Your nodes**, where you can edit or delete it. Deletion is blocked if any skill still references that node name.

---

## 3. Skill builder: composing a workflow

Open **Skill builder**.

1. Optionally set **Who can use this skill** (departments / roles).
2. Enter a **Skill name** (required when creating a new skill).
3. Under **Add step**, choose a **custom node** from the dropdown and click **Add to workflow**. Repeat to build an ordered list (up to **10** steps). The dropdown lists **your org’s nodes** only; document retrieval is **not** a selectable step (see §4).
4. Use the arrows to reorder steps, or remove a step with the trash control.
5. **Create skill** or **Save changes** when editing.

To use the skill in **Chat**, install it from the **Marketplace** first (`POST /api/skills/install` or the UI equivalent). Chat requires an installed skill when you pass `skill_id`.

---

## 4. How it works internally (high level)

When the user sends a message with a skill selected:

1. **User message** becomes **`{{query}}`** for substitution. The same text is embedded for **document retrieval** when the document pipeline is enabled on the API.
2. **Retrieval (automatic)** — If the API started with the document pipeline (S3, Weaviate, embeddings configured), the runtime runs **one** vector search over indexed chunks for the user’s **department**, using the user message as the search query. Matching chunk texts are concatenated into **`{{context}}`**. If the pipeline is off, `{{context}}` stays empty for that request.
3. **Execution order** — The graph is effectively: **`retrieve_documents` (system) → your node 1 → your node 2 → …`**. You do not add `retrieve_documents` in the skill list in the UI; it is always prepended when the pipeline is on. Any legacy `retrieve_documents` entry stored in a skill is deduplicated at runtime (still only one search).
4. **Each node** — For each step, the server loads your **prompt template**, replaces placeholders, optionally appends helper text when context is missing or when the template omits `{{context}}` but excerpts exist (see `runtime.ts`), then calls the LLM once. The **last** step’s reply is what the user sees as the chat **reply** (earlier steps can chain via `{{output}}`).
5. **Placeholders** — **`{{query}}`**: current user message. **`{{context}}`**: retrieved excerpt text (not the raw user question). **`{{output}}`**: the **previous** prompt node’s assistant text in the same request; empty on the **first** prompt node after retrieval.

Important: **`{{context}}` is not a copy of `{{query}}`**. If you omit `{{query}}` from the template, the model may never see the user’s exact wording in the prompt body, even though that wording was used to retrieve chunks.

---

## 5. Example A — Single node (simple)

**Goal:** Answer questions using indexed docs, with a clear instruction block.

**Steps**

1. **Node builder** — Create a node named `answer_with_docs`.

   **Prompt template example:**

   ```text
   You are a careful assistant. Use only the evidence in CONTEXT when it supports your answer.
   If CONTEXT is insufficient, say what is missing.

   USER QUESTION:
   {{query}}

   CONTEXT (retrieved excerpts):
   {{context}}

   Answer in short paragraphs.
   ```

2. **Skill builder** — New skill `qa_basic`, workflow: `answer_with_docs` only.

3. **Marketplace** — Install the skill.

4. **Chat** — Select `qa_basic`, upload/ingest documents as your app allows, then ask a specific question (e.g. “What is the notice period in the handbook?”).

**What happens** — Retrieval fills `{{context}}` with top-matching chunks. The model sees both the question and the excerpts in one LLM call.

---

## 6. Example B — Two nodes (slightly harder)

**Goal:** First draft a structured summary from excerpts; second step reformats it into bullets aligned with the original question.

**Node 1 — `summarize_structured`**

```text
From CONTEXT, produce a factual summary for the user’s question.
Use headings: Facts / Gaps / Assumptions.

QUESTION:
{{query}}

CONTEXT:
{{context}}
```

**Node 2 — `format_bullets`**

```text
Rewrite the following DRAFT into at most 8 bullet points.
Keep only claims supported by CONTEXT; mark uncertainty explicitly.
Do not invent sources.

QUESTION (for alignment):
{{query}}

CONTEXT (for fact-checking short claims):
{{context}}

DRAFT FROM PREVIOUS STEP:
{{output}}
```

**Skill** — Workflow order: `summarize_structured` → `format_bullets`.

**What happens** — Same retrieval and same `{{query}}` / `{{context}}` for **both** steps. Step 2 additionally receives step 1’s full reply via **`{{output}}`**. The **final** chat reply is step 2’s output.

If step 2 omitted **`{{output}}`**, it would ignore step 1 entirely and you would pay for two nearly redundant calls.

---

## 7. Best practices

1. **Include `{{query}}` in the first node** (and often in later nodes) so the model sees the user’s task, not only chunks. Retrieval uses the query internally; it does not automatically inject the question into `{{context}}`.

2. **Use `{{context}}` whenever answers should be grounded** in uploaded material. Be explicit in instructions (“cite or quote only from CONTEXT”).

3. **Chain with `{{output}}`** when a later step should refine, shorten, translate, or reformat an earlier step’s answer. Avoid duplicate nodes that only repeat the same template without `{{output}}`.

4. **Write retrieval-friendly user guidance** in skill descriptions or in-app docs: short, vague questions retrieve weaker chunks. Encourage users to name documents, sections, or distinctive terms.

5. **Keep node names stable** — Skills reference names as strings. Renaming a node in the UI may require updating every skill that referenced the old name (depending on product behavior); prefer choosing a good `snake_case` name up front.

6. **Allow lists** — If a node or skill is restricted by department/role, users outside that set cannot use it even if the skill is installed; align node and skill visibility with who should run sensitive prompts.

7. **Document pipeline** — If the API logs that the document pipeline is disabled, `{{context}}` will be empty and retrieval will not run; chat may still answer from general knowledge depending on template wording. Fix env and services (see `README.md` / `docs/spec.md`) for RAG.

8. **Reserved name** — Do not create a user node named `retrieve_documents`; it is reserved for the system step.

9. **Testing** — After changing a template, run a real chat turn with representative uploads. Empty or irrelevant `{{context}}` is often a retrieval or ingest issue, not only a prompt issue.

---

## 8. Where to read more

- **`docs/spec.md`** — Routes, persistence, and runtime behavior as implemented.
- **`docs/chat.md`** — Chat request lifecycle (including SSE).
- **`docs/document.md`** — Upload and ingest path for indexed documents.

This tutorial reflects the application design at the time of writing; if behavior changes, prefer `docs/spec.md` as the source of truth.
