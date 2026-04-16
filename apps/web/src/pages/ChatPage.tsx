import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BotIcon,
  ChevronDown,
  ChevronRight,
  Loader2Icon,
  SendHorizonalIcon,
  UserIcon,
} from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import { ChatHistorySidebar } from "@/components/chat/ChatHistorySidebar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { postChatStream } from "@/lib/chatClient";
import { getConversation } from "@/lib/chatHistoryClient";
import { listSkills, type SkillSummaryDto } from "@/lib/skillsClient";
import { splitThinkText } from "@/lib/thinkSplitter";
import { useStickyBoolean } from "@/lib/useStickyBoolean";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

type ChatLine = {
  id: string;
  role: ChatRole;
  content: string;
  reasoning: string;
  reasoningOpen: boolean;
  isStreaming: boolean;
  traceId?: string;
};

const textareaClass =
  "min-h-[56px] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

const chatStreamTimeoutMs = 180_000;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function tailPreview(text: string, max = 60): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) {
    return collapsed;
  }
  return `...${collapsed.slice(collapsed.length - max)}`;
}

type ReasoningBlockProps = {
  reasoning: string;
  open: boolean;
  isStreaming: boolean;
  onToggle: () => void;
};

function ReasoningBlock({ reasoning, open, isStreaming, onToggle }: ReasoningBlockProps): JSX.Element {
  if (reasoning.length === 0 && !isStreaming) {
    return <></>;
  }
  const label = isStreaming ? "Thinking" : "Reasoning";
  return (
    <div className="mb-2 rounded-md border border-dashed border-muted bg-muted/20 text-xs">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        )}
        <span className="font-medium">{label}</span>
        {!open && reasoning.length > 0 ? (
          <span className="ml-1 min-w-0 flex-1 truncate italic opacity-80">
            {tailPreview(reasoning)}
          </span>
        ) : null}
        {isStreaming ? (
          <Loader2Icon className="ml-auto size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : null}
      </button>
      {open ? (
        <div
          data-testid="reasoning-expanded-body"
          className="whitespace-pre-wrap wrap-break-word border-t border-dashed border-muted px-2.5 py-2 text-muted-foreground"
        >
          {reasoning || (isStreaming ? "..." : "")}
        </div>
      ) : null}
    </div>
  );
}

export function ChatPage() {
  const { accessToken, authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSkillId = searchParams.get("skill_id");
  const urlConversationId = searchParams.get("c");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillSummaryDto[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [urlSkillWarning, setUrlSkillWarning] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string>("");
  const [historyCollapsed, setHistoryCollapsed] = useStickyBoolean(
    "sidebar.right.collapsed",
    false,
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    urlConversationId,
  );
  const [loadingConversation, setLoadingConversation] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const refreshHistoryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) {
      setSkills([]);
      setSelectedSkillId("");
      setSkillsLoading(false);
      return;
    }
    setSkillsLoading(true);
    void (async () => {
      try {
        const res = await listSkills(accessToken, { installed_only: true });
        if (!cancelled) {
          setSkills(res.skills);
          setSkillsError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setSkillsError(e instanceof Error ? e.message : "Failed to load skills");
          setSkills([]);
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || skillsLoading) {
      return;
    }
    if (urlSkillId) {
      const match = skills.find((s) => s.skill_id === urlSkillId);
      if (match) {
        setSelectedSkillId(urlSkillId);
        setUrlSkillWarning(null);
        return;
      }
      setUrlSkillWarning("That skill is not in your installed list or the link is invalid.");
      setSelectedSkillId("");
      return;
    }
    setUrlSkillWarning(null);
    setSelectedSkillId((current) => {
      if (current === "") {
        return "";
      }
      if (current && skills.some((s) => s.skill_id === current)) {
        return current;
      }
      return "";
    });
  }, [accessToken, skills, skillsLoading, urlSkillId]);

  useEffect(() => {
    setActiveConversationId(urlConversationId);
  }, [urlConversationId]);

  useEffect(() => {
    if (!accessToken || !activeConversationId) {
      return;
    }
    let cancelled = false;
    setLoadingConversation(true);
    void (async () => {
      try {
        const conv = await getConversation(accessToken, activeConversationId);
        if (cancelled) return;
        const nextLines: ChatLine[] = conv.messages.map((msg) => {
          if (msg.role === "assistant") {
            const { content, reasoning } = splitThinkText(msg.content);
            return {
              id: msg.id,
              role: "assistant" as const,
              content,
              reasoning,
              reasoningOpen: false,
              isStreaming: false,
              traceId: msg.trace_id,
            };
          }
          return {
            id: msg.id,
            role: "user" as const,
            content: msg.content,
            reasoning: "",
            reasoningOpen: false,
            isStreaming: false,
            traceId: msg.trace_id,
          };
        });
        setLines(nextLines);
        if (conv.skill_id) {
          setSelectedSkillId(conv.skill_id);
        }
        setError(null);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load conversation");
        }
      } finally {
        if (!cancelled) {
          setLoadingConversation(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeConversationId]);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.skill_id === selectedSkillId),
    [skills, selectedSkillId],
  );

  const hideSkillPicker = Boolean(urlSkillId && skills.some((s) => s.skill_id === urlSkillId));

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, sending]);

  const selectConversation = useCallback(
    (id: string | null) => {
      setActiveConversationId(id);
      setError(null);
      setLines(id ? (prev) => prev : []);
      if (!id) {
        setLines([]);
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) {
            next.set("c", id);
          } else {
            next.delete("c");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const toggleReasoning = useCallback((assistantId: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.id === assistantId ? { ...line, reasoningOpen: !line.reasoningOpen } : line,
      ),
    );
  }, []);

  const send = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !accessToken || sending) {
      return;
    }

    setSending(true);
    setError(null);
    setDraft("");

    const userLine: ChatLine = {
      id: newId(),
      role: "user",
      content: trimmed,
      reasoning: "",
      reasoningOpen: false,
      isStreaming: false,
    };
    const assistantId = newId();
    setLines((previous) => [
      ...previous,
      userLine,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        reasoning: "",
        reasoningOpen: false,
        isStreaming: true,
        traceId: undefined,
      },
    ]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), chatStreamTimeoutMs);
    try {
      const result = await postChatStream(
        accessToken,
        trimmed,
        {
          ...(selectedSkillId ? { skill_id: selectedSkillId } : {}),
          ...(activeConversationId ? { conversation_id: activeConversationId } : {}),
        },
        {
          onMeta: ({ trace_id }) => {
            setLines((previous) =>
              previous.map((line) =>
                line.id === assistantId ? { ...line, traceId: trace_id } : line,
              ),
            );
          },
          onConversation: ({ conversation_id }) => {
            if (!activeConversationId) {
              setActiveConversationId(conversation_id);
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("c", conversation_id);
                  return next;
                },
                { replace: true },
              );
            }
          },
          onToken: (delta) => {
            setLines((previous) =>
              previous.map((line) =>
                line.id === assistantId
                  ? { ...line, content: line.content + delta }
                  : line,
              ),
            );
          },
          onReasoningDelta: (delta) => {
            setLines((previous) =>
              previous.map((line) =>
                line.id === assistantId
                  ? { ...line, reasoning: line.reasoning + delta }
                  : line,
              ),
            );
          },
        },
        controller.signal,
      );
      const { content, reasoning } = splitThinkText(result.reply);
      setLines((previous) =>
        previous.map((line) =>
          line.id === assistantId
            ? {
                ...line,
                content,
                reasoning,
                isStreaming: false,
                traceId: result.traceId || line.traceId,
              }
            : line,
        ),
      );
      if (!activeConversationId && result.conversationId) {
        setActiveConversationId(result.conversationId);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("c", result.conversationId);
            return next;
          },
          { replace: true },
        );
      }
      refreshHistoryRef.current?.();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? `Chat request timed out after ${Math.round(chatStreamTimeoutMs / 1000)}s`
          : err instanceof Error
            ? err.message
            : "Request failed";
      setError(message);
      setLines((previous) =>
        previous.map((line) =>
          line.id === assistantId
            ? { ...line, content: `Error: ${message}`, isStreaming: false }
            : line,
        ),
      );
    } finally {
      clearTimeout(timer);
      setSending(false);
    }
  }, [accessToken, activeConversationId, draft, selectedSkillId, sending, setSearchParams]);

  if (authLoading) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-10">
        <p className="text-sm text-muted-foreground">Checking session...</p>
      </main>
    );
  }

  if (!accessToken) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-10">
        <div className="flex max-w-sm flex-col gap-3 rounded-lg border bg-background p-6 shadow-sm">
          <h1 className="font-heading text-lg font-semibold tracking-tight">Sign in required</h1>
          <p className="text-sm text-muted-foreground">
            Chat is authenticated and uses your uploaded document index.
          </p>
          <Button type="button" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b bg-background/80 px-6 py-3 backdrop-blur">
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate font-heading text-base font-semibold tracking-tight">
              {activeConversationId ? "Conversation" : "New chat"}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {selectedSkill ? `Skill: ${selectedSkill.name}` : "Default chat (model + retrieval only)"}
            </p>
          </div>
        </div>

        <section
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5"
          aria-label="Conversation"
        >
          {loadingConversation ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              Loading conversation...
            </p>
          ) : null}
          {!loadingConversation && lines.length === 0 ? (
            <div className="mx-auto my-auto max-w-md text-center text-sm text-muted-foreground">
              <p>Send a message to start a new conversation.</p>
              <p className="mt-1 text-xs">
                Browse the{" "}
                <Link to="/marketplace" className="text-primary underline-offset-4 hover:underline">
                  Marketplace
                </Link>
                {" "}to install skills, or build your own from the{" "}
                <Link to="/skills" className="text-primary underline-offset-4 hover:underline">
                  Skill builder
                </Link>
                .
              </p>
            </div>
          ) : null}
          {lines.map((line) => (
            <div
              key={line.id}
              className={cn(
                "flex gap-2 rounded-lg border px-3 py-2 text-sm",
                line.role === "user"
                  ? "ml-auto max-w-[80%] border-primary/25 bg-primary/5"
                  : "mr-auto max-w-[85%] border-muted bg-muted/30",
              )}
            >
              <div className="mt-0.5 shrink-0 text-muted-foreground">
                {line.role === "user" ? (
                  <UserIcon className="size-4" />
                ) : (
                  <BotIcon className="size-4" />
                )}
              </div>
              <div className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word text-foreground">
                {line.role === "assistant" ? (
                  <>
                    <ReasoningBlock
                      reasoning={line.reasoning}
                      open={line.reasoningOpen}
                      isStreaming={line.isStreaming && line.content === ""}
                      onToggle={() => toggleReasoning(line.id)}
                    />
                    {line.content === "" && line.isStreaming && line.reasoning === "" ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <Loader2Icon className="size-4 animate-spin" aria-hidden />
                        Generating...
                      </span>
                    ) : (
                      line.content
                    )}
                  </>
                ) : (
                  line.content
                )}
              </div>
            </div>
          ))}
          <div ref={listEndRef} />
        </section>

        <div className="flex flex-col gap-2 border-t bg-muted/10 px-6 py-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {!skillsLoading ? (
            <div className="flex flex-wrap items-center gap-2">
              {hideSkillPicker ? (
                <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs">
                  <Label className="text-xs font-medium text-muted-foreground">Skill</Label>
                  <span className="font-medium text-foreground">{selectedSkill?.name ?? "Skill"}</span>
                  <Link
                    to="/"
                    replace
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Change
                  </Link>
                </div>
              ) : (
                <>
                  <Label htmlFor="skill-pick" className="text-xs font-medium text-muted-foreground">
                    Skill
                  </Label>
                  <select
                    id="skill-pick"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={selectedSkillId}
                    onChange={(e) => setSelectedSkillId(e.target.value)}
                    disabled={sending}
                  >
                    <option value="">Default chat (model + retrieval only)</option>
                    {skills.map((s) => (
                      <option key={s.skill_id} value={s.skill_id}>
                        {s.name}
                        {s.nodes.length > 0 ? ` (${s.nodes.join(" -> ")})` : ""}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {skillsError ? (
                <span className="text-xs text-destructive" role="alert">
                  {skillsError}
                </span>
              ) : null}
              {urlSkillWarning ? (
                <span className="text-xs text-amber-700 dark:text-amber-400" role="status">
                  {urlSkillWarning}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <textarea
              id="chat-input"
              className={cn(textareaClass, "flex-1")}
              placeholder="Message..."
              value={draft}
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void send()}
              className="shrink-0"
            >
              {sending ? (
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
              ) : (
                <SendHorizonalIcon className="size-4" aria-hidden />
              )}
              <span className="ml-1.5">Send</span>
            </Button>
          </div>
        </div>
      </main>

      <ChatHistorySidebar
        accessToken={accessToken}
        activeConversationId={activeConversationId}
        collapsed={historyCollapsed}
        onToggle={() => setHistoryCollapsed((v) => !v)}
        onSelect={selectConversation}
        refreshRef={refreshHistoryRef}
      />
    </div>
  );
}
