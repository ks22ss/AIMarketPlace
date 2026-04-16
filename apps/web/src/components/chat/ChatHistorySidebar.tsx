import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Loader2Icon,
  Pencil,
  Plus,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteConversation,
  listConversations,
  renameConversation,
  type ChatConversationSummary,
} from "@/lib/chatHistoryClient";
import { cn } from "@/lib/utils";

type Props = {
  accessToken: string;
  activeConversationId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string | null) => void;
  /** Ref-cell handle to allow parent to refresh the list (after a chat turn completes). */
  refreshRef?: { current: (() => void) | null };
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ChatHistorySidebar({
  accessToken,
  activeConversationId,
  collapsed,
  onToggle,
  onSelect,
  refreshRef,
}: Props): JSX.Element {
  const [items, setItems] = useState<ChatConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listConversations(accessToken);
      setItems(list);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load chat history");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (refreshRef) {
      refreshRef.current = () => {
        void refresh();
      };
      return () => {
        refreshRef.current = null;
      };
    }
  }, [refresh, refreshRef]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const startRename = useCallback((item: ChatConversationSummary) => {
    setRenamingId(item.conversation_id);
    setDraftTitle(item.title);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingId) return;
    const title = draftTitle.trim();
    if (title.length === 0) {
      setRenamingId(null);
      return;
    }
    const prev = items;
    setItems((list) =>
      list.map((it) => (it.conversation_id === renamingId ? { ...it, title } : it)),
    );
    setBusyId(renamingId);
    try {
      await renameConversation(accessToken, renamingId, title);
    } catch (e: unknown) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusyId(null);
      setRenamingId(null);
    }
  }, [accessToken, draftTitle, items, renamingId]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setDraftTitle("");
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const target = items.find((it) => it.conversation_id === id);
      if (!target) return;
      if (!window.confirm(`Delete "${target.title}"? This cannot be undone.`)) {
        return;
      }
      setBusyId(id);
      try {
        await deleteConversation(accessToken, id);
        setItems((list) => list.filter((it) => it.conversation_id !== id));
        if (activeConversationId === id) {
          onSelect(null);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setBusyId(null);
      }
    },
    [accessToken, activeConversationId, items, onSelect],
  );

  const rows = useMemo(() => items, [items]);

  if (collapsed) {
    return (
      <aside
        className="flex w-10 shrink-0 flex-col items-center border-l border-sidebar-border bg-sidebar py-4"
        aria-label="Chat history (collapsed)"
      >
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
          onClick={onToggle}
          aria-label="Expand chat history"
          aria-expanded={false}
          title="Chat history"
        >
          <PanelRightOpen className="size-4" aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="flex w-72 shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground"
      aria-label="Chat history"
    >
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-3">
        <span className="text-sm font-semibold">Chat history</span>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
          onClick={onToggle}
          aria-label="Collapse chat history"
          aria-expanded
          title="Collapse"
        >
          <PanelRightClose className="size-4" aria-hidden />
        </button>
      </div>

      <div className="px-3 py-3">
        <Button
          type="button"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => onSelect(null)}
        >
          <Plus className="size-4" aria-hidden />
          New chat
        </Button>
      </div>

      {error ? (
        <p className="px-3 pb-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3">
        {loading && rows.length === 0 ? (
          <p className="flex items-center gap-2 px-2 py-3 text-sm text-sidebar-foreground/70">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : null}
        {!loading && rows.length === 0 ? (
          <p className="px-2 py-3 text-xs text-sidebar-foreground/60">
            No conversations yet. Start one below.
          </p>
        ) : null}
        {rows.map((item) => {
          const isActive = item.conversation_id === activeConversationId;
          const isRenaming = renamingId === item.conversation_id;
          return (
            <div
              key={item.conversation_id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-2 text-sm",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60",
              )}
            >
              {isRenaming ? (
                <>
                  <input
                    ref={renameInputRef}
                    className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:border-ring"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    onBlur={() => void commitRename()}
                    maxLength={120}
                    aria-label="New conversation title"
                  />
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded hover:bg-sidebar-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void commitRename();
                    }}
                    aria-label="Save title"
                    title="Save"
                  >
                    <Check className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded hover:bg-sidebar-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      cancelRename();
                    }}
                    aria-label="Cancel rename"
                    title="Cancel"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                    onClick={() => onSelect(item.conversation_id)}
                    title={item.title}
                  >
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className="truncate text-xs text-sidebar-foreground/60">
                      {relativeTime(item.updated_at)}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded hover:bg-sidebar-accent"
                      onClick={() => startRename(item)}
                      aria-label={`Rename ${item.title}`}
                      title="Rename"
                      disabled={busyId === item.conversation_id}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void handleDelete(item.conversation_id)}
                      aria-label={`Delete ${item.title}`}
                      title="Delete"
                      disabled={busyId === item.conversation_id}
                    >
                      {busyId === item.conversation_id ? (
                        <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-3.5" aria-hidden />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
