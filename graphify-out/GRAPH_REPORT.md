# Graph Report - .  (2026-04-17)

## Corpus Check
- 89 files · ~47,753 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 348 nodes · 510 edges · 46 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 87 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]

## God Nodes (most connected - your core abstractions)
1. `resolveApiUrl()` - 27 edges
2. `json()` - 26 edges
3. `createDocumentPipelineFromEnv()` - 8 edges
4. `handleApiRoute()` - 8 edges
5. `asyncHandler()` - 7 edges
6. `start()` - 6 edges
7. `createChatModelFromEnv()` - 6 edges
8. `postChatStream()` - 6 edges
9. `readErrorMessage()` - 6 edges
10. `Web UI (React)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `respondPipelineDisabled()` --calls--> `json()`  [INFERRED]
  apps\api\src\features\docs\docs.routes.ts → tests\fixtures\apiMock.ts
- `mapPipelineError()` --calls--> `json()`  [INFERRED]
  apps\api\src\features\docs\docs.routes.ts → tests\fixtures\apiMock.ts
- `createNodesRouter()` --calls--> `asyncHandler()`  [INFERRED]
  apps\api\src\features\nodes\nodes.routes.ts → apps\api\src\lib\async-handler.ts
- `start()` --calls--> `createDocumentPipelineFromEnv()`  [INFERRED]
  apps\api\src\index.ts → apps\api\src\features\docs\docs.factory.ts
- `start()` --calls--> `createChatRouter()`  [INFERRED]
  apps\api\src\index.ts → apps\api\src\features\chat\chat.routes.ts

## Hyperedges (group relationships)
- **Document ingest: S3 object → MIME resolution → text extraction → embeddings → Weaviate chunks** — fn_ingest_document, apps_api_features_docs_s3_storage_ts, fn_resolve_ingest_content_type, fn_extract_text_from_buffer, fn_embed_texts, apps_api_features_docs_weaviate_store_ts [EXTRACTED 0.92]
- **Marketplace listing: org skills, per-user accessible flag, optional hidden details** — apps_api_features_marketplace_marketplace_routes_ts, fn_find_org_skills_with_access, apps_api_lib_org_config_ts, apps_api_lib_access_summary_ts, fn_parse_stored_skill_nodes [EXTRACTED 0.90]
- **LangGraph skill run: execution order, retrieve_documents, prompt nodes, timeouts, graph cache** — fn_run_skill, fn_build_skill_execution_order, fn_retrieve_documents_node, fn_query_context_rag, fn_with_timeout, apps_api_lib_agent_runtime_ts [EXTRACTED 0.93]
- **Authenticated chrome (nav + Outlet + health)** — requireauth_route_guard, applayout_shell, apihealthdot_component, authcontext_module [INFERRED 0.76]
- **Chat streaming + history + skills selection** — page_chat, chatclient_module, chathistoryclient_module, skillsclient_module, thinksplitter_module, chathistorysidebar_component [EXTRACTED 1.00]
- **Marketplace catalog + install/uninstall + pagination** — page_marketplace, marketplaceclient_module, endpoint_marketplace_skills, endpoint_skills_install [EXTRACTED 1.00]
- **Registration (spec ↔ UI ↔ reference API)** —  [INFERRED]
- **Settings profile mirrors GET /api/auth/me** —  [INFERRED]
- **Skill builder ↔ skills/nodes/reference APIs** —  [INFERRED]
- **Playwright global setup seeds token + mocked API** —  [INFERRED]
- **Smoke tests over mocked marketplace + chat + docs** —  [INFERRED]
- **Chat streaming contract (doc + spec + mock + UI test)** —  [INFERRED]
- **Document pipeline (doc + spec + mock + smoke)** —  [INFERRED]
- **Weaviate retrieval filter wording: cross-check README vs spec §5** —  [INFERRED]
- **Document ingestion pipeline** —  [EXTRACTED]
- **Protected chat + RAG + LangGraph response** —  [EXTRACTED]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (50): GET /api/auth/me, GET /api/docs, GET /api/marketplace/skills, GET /api/nodes, GET /api/reference/departments, GET /api/reference/roles, GET /api/skills, PATCH /api/skills/:skillId (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (33): resolveApiUrl(), fetchHealth(), json(), authHeaders(), deleteConversation(), getConversation(), listConversations(), readErrorMessage() (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (18): accessSummaryForSkill(), asyncHandler(), createChatClientFromEnv(), createChatModelFromEnv(), getChatModelId(), getChatTemperature(), resolveChatApiKey(), resolveChatBaseUrl() (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (14): effectiveOrgId(), userMatchesAllowLists(), mapRowToPublicUser(), parseSkillNodes(), prepareChatExecution(), createNodesRouter(), isSystemNodeName(), blockingSkillsForNodeName() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (12): createDocumentPipelineFromEnv(), requireEmbeddingApiKey(), requireEnv(), buildObjectKey(), createDocumentPipeline(), orgKey(), sanitizeFileName(), createEmbeddingClient() (+4 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (11): aiMessageContentToString(), buildSkillExecutionOrder(), callLlm(), compileSkillGraph(), evictSkillGraphCacheIfNeeded(), promptNodeFactory(), retrieveDocumentsNode(), runSkill() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (6): createAuthController(), verifyAccessToken(), requireAuth(), createAuthRepository(), createAuthRouter(), createAuthService()

### Community 7 - "Community 7"
Cohesion: 0.21
Nodes (16): Auth Module, Chat Module, Compile + Invoke Langraph, create Document Presign URL, Docs Module, ETL extract, chunking, embed, Express API, Filter Skills visible for User (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.27
Nodes (10): chatSseBody(), createDefaultMockState(), deriveMockTitle(), handleApiRoute(), hasBearer(), installApiMock(), matchApiPath(), unauthorized() (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): deriveConversationTitle(), newMessageId(), nowIso(), parseStoredMessages(), toConversationDto(), upsertConversationTurn()

### Community 10 - "Community 10"
Cohesion: 0.39
Nodes (7): buildBody(), parseSseBlock(), postChat(), postChatStream(), readErrorMessage(), createThinkSplitter(), splitThinkText()

### Community 11 - "Community 11"
Cohesion: 0.4
Nodes (3): isSafeAppReturnPath(), postAuthDestination(), handleSubmit()

### Community 12 - "Community 12"
Cohesion: 0.4
Nodes (2): navLinkClass(), cn()

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 0.4
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 0.5
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 0.67
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **1 isolated node(s):** `Main Flow of App`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 21`** (2 nodes): `resolve-allow-lists.ts`, `resolveAllowLists()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `AuthContext.tsx`, `AuthProvider()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `RequireAuth.tsx`, `RequireAuth()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `ChatHistorySidebar.tsx`, `relativeTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `button.tsx`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `label.tsx`, `Label()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `thinkSplitter.test.ts`, `concat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `useStickyBoolean.ts`, `useStickyBoolean()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `LoginPage.tsx`, `LoginPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `MarketplacePage.tsx`, `iconIndexForSkillId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `setAccessTokenInStorage()`, `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `public-api.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `rag-qa.skill.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `org-config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `express.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `input.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `planLimits.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `user.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `smoke.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `json()` connect `Community 1` to `Community 2`, `Community 6`, `Community 8`, `Community 10`, `Community 11`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `isSystemNodeName()` connect `Community 3` to `Community 5`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `resolveApiUrl()` (e.g. with `fetchHealth()` and `postChat()`) actually correct?**
  _`resolveApiUrl()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `json()` (e.g. with `requireAuth()` and `respondPipelineDisabled()`) actually correct?**
  _`json()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Main Flow of App` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._