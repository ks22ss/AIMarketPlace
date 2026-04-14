import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BotIcon, Loader2Icon, SendHorizonalIcon, UserIcon } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { postChat } from "@/lib/chatClient";
import { listSkills, type SkillSummaryDto } from "@/lib/skillsClient";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

type ChatLine = {
  id: string;
  role: ChatRole;
  content: string;
  traceId?: string;
};

const textareaClass =
  "min-h-[72px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatPage() {
  const { accessToken, authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const urlSkillId = searchParams.get("skill_id");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillSummaryDto[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [urlSkillWarning, setUrlSkillWarning] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string>("");
  const listEndRef = useRef<HTMLDivElement | null>(null);

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

  const selectedSkill = useMemo(
    () => skills.find((s) => s.skill_id === selectedSkillId),
    [skills, selectedSkillId],
  );

  const hideSkillPicker = Boolean(urlSkillId && skills.some((s) => s.skill_id === urlSkillId));

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, sending]);

  const send = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !accessToken || sending) {
      return;
    }

    setSending(true);
    setError(null);
    setDraft("");

    const userLine: ChatLine = { id: newId(), role: "user", content: trimmed };
    setLines((previous) => [...previous, userLine]);

    try {
      const result = await postChat(
        accessToken,
        trimmed,
        selectedSkillId ? { skill_id: selectedSkillId } : undefined,
      );
      setLines((previous) => [
        ...previous,
        {
          id: newId(),
          role: "assistant",
          content: result.reply,
          traceId: result.traceId,
        },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message);
      setLines((previous) => [
        ...previous,
        {
          id: newId(),
          role: "assistant",
          content: `Error: ${message}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [accessToken, draft, selectedSkillId, sending]);

  return (
    <main className="flex min-h-svh flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Skill chat</h1>
          <p className="text-sm text-muted-foreground">
            Chat always uses the model (and document retrieval when configured). Optional{" "}
            <strong>installed</strong> skills add workflow steps — pick one below or leave{" "}
            <em>Default chat</em>. Browse the{" "}
            <Link to="/marketplace" className="text-primary underline-offset-4 hover:underline">
              Marketplace
            </Link>
            , build nodes on the{" "}
            <Link to="/skills" className="text-primary underline-offset-4 hover:underline">
              Skill builder
            </Link>
            .
          </p>
        </div>

        {authLoading ? <p className="text-sm text-muted-foreground">Checking session…</p> : null}

        {!authLoading && !accessToken ? (
          <Card>
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
              <CardDescription>Chat is authenticated and uses your uploaded document index.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button type="button" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {!authLoading && accessToken ? (
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="border-b pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BotIcon className="size-5 opacity-80" />
                Conversation
              </CardTitle>
              <CardDescription>Messages stay in this browser tab until you refresh.</CardDescription>
            </CardHeader>
            <CardContent className="flex max-h-[min(520px,70vh)] flex-col gap-3 overflow-y-auto px-4 py-4">
              {skillsLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  Loading installed skills…
                </p>
              ) : null}
              {!skillsLoading ? (
                <div className="flex flex-col gap-2">
                  {hideSkillPicker ? (
                    <>
                      <Label>Skill</Label>
                      <div className="flex flex-col gap-1 rounded-md border border-input bg-muted/20 px-3 py-2 text-sm">
                        <span className="font-medium text-foreground">{selectedSkill?.name ?? "Skill"}</span>
                        <span className="text-xs text-muted-foreground">
                          {selectedSkill?.access_summary ?? ""}
                        </span>
                        <Link
                          to="/chat"
                          replace
                          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Change skill
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <Label htmlFor="skill-pick">Skill</Label>
                      <select
                        id="skill-pick"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                        value={selectedSkillId}
                        onChange={(e) => setSelectedSkillId(e.target.value)}
                        disabled={sending}
                      >
                        <option value="">Default chat (model + retrieval only)</option>
                        {skills.map((s) => (
                          <option key={s.skill_id} value={s.skill_id}>
                            {s.name}
                            {s.nodes.length > 0 ? ` (${s.nodes.join(" → ")})` : ""}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {skillsError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {skillsError}
                    </p>
                  ) : null}
                  {urlSkillWarning ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
                      {urlSkillWarning}
                    </p>
                  ) : null}
                  {skills.length === 0 && !skillsLoading ? (
                    <p className="text-xs text-muted-foreground">
                      No optional workflows installed — you can still use default chat. Add skills from the{" "}
                      <Link to="/marketplace" className="font-medium text-primary underline-offset-4 hover:underline">
                        Marketplace
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>
              ) : null}
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Send a message — the model replies every time.</p>
              ) : null}
              {lines.map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    "flex gap-2 rounded-lg border px-3 py-2 text-sm",
                    line.role === "user" ? "ml-8 border-primary/25 bg-primary/5" : "mr-8 border-muted bg-muted/30",
                  )}
                >
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {line.role === "user" ? <UserIcon className="size-4" /> : <BotIcon className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word text-foreground">{line.content}</div>
                </div>
              ))}
              {sending ? (
                <div className="mr-8 flex items-center gap-2 rounded-lg border border-muted bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Thinking…
                </div>
              ) : null}
              <div ref={listEndRef} />
            </CardContent>
            <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-4">
              {error ? (
                <p className="w-full text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex w-full flex-col gap-2">
                <Label htmlFor="chat-input">Message</Label>
                <textarea
                  id="chat-input"
                  className={cn(textareaClass)}
                  placeholder="Ask something about your uploaded documents…"
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
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => setLines([])}>
                  Clear
                </Button>
                <Button type="button" disabled={sending || !draft.trim()} onClick={() => void send()}>
                  {sending ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />
                      Send
                    </>
                  ) : (
                    <>
                      <SendHorizonalIcon className="size-4" data-icon="inline-start" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </CardFooter>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
