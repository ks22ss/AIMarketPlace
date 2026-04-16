/**
 * Streaming splitter that separates `<think>...</think>` reasoning from visible content.
 *
 * Handles tag markers arriving across chunk boundaries (e.g. `<thi` then `nk>`). The
 * `<think>` / `</think>` markers themselves are never emitted; everything between them
 * is reported as `reasoning`, everything outside as `content`.
 */
export type ThinkTokenKind = "content" | "reasoning";

export type ThinkToken = { kind: ThinkTokenKind; text: string };

const OPEN = "<think>";
const CLOSE = "</think>";

export type ThinkSplitter = {
  push: (delta: string) => ThinkToken[];
  /** Flush any buffered tag-prefix as the matching kind (end of stream safety). */
  flush: () => ThinkToken[];
};

export function createThinkSplitter(): ThinkSplitter {
  let mode: ThinkTokenKind = "content";
  let buffer = "";

  function activeMarker(): string {
    return mode === "content" ? OPEN : CLOSE;
  }

  function emitChunk(text: string, kind: ThinkTokenKind, out: ThinkToken[]): void {
    if (text.length === 0) {
      return;
    }
    const last = out[out.length - 1];
    if (last && last.kind === kind) {
      last.text += text;
    } else {
      out.push({ kind, text });
    }
  }

  /**
   * When the tail of `buffer` could still be completing the active marker on the next
   * chunk, we hold it back. Returns the split point: characters before it are safe to
   * emit; characters at/after are kept in `buffer`.
   */
  function safeEmitBoundary(): number {
    const marker = activeMarker();
    const maxHold = marker.length - 1;
    const start = Math.max(0, buffer.length - maxHold);
    for (let i = start; i < buffer.length; i++) {
      const tail = buffer.slice(i);
      if (marker.startsWith(tail)) {
        return i;
      }
    }
    return buffer.length;
  }

  function push(delta: string): ThinkToken[] {
    if (delta.length === 0) {
      return [];
    }
    buffer += delta;
    const out: ThinkToken[] = [];
    let guard = 0;
    while (guard++ < 10_000) {
      const marker = activeMarker();
      const idx = buffer.indexOf(marker);
      if (idx >= 0) {
        if (idx > 0) {
          emitChunk(buffer.slice(0, idx), mode, out);
        }
        buffer = buffer.slice(idx + marker.length);
        mode = mode === "content" ? "reasoning" : "content";
        continue;
      }
      const boundary = safeEmitBoundary();
      if (boundary > 0) {
        emitChunk(buffer.slice(0, boundary), mode, out);
        buffer = buffer.slice(boundary);
      }
      break;
    }
    return out;
  }

  function flush(): ThinkToken[] {
    if (buffer.length === 0) {
      return [];
    }
    const out: ThinkToken[] = [];
    emitChunk(buffer, mode, out);
    buffer = "";
    return out;
  }

  return { push, flush };
}

/**
 * Run the splitter over a full text once (e.g. rehydrating a persisted assistant message).
 */
export function splitThinkText(text: string): { content: string; reasoning: string } {
  const splitter = createThinkSplitter();
  const tokens = [...splitter.push(text), ...splitter.flush()];
  let content = "";
  let reasoning = "";
  for (const tok of tokens) {
    if (tok.kind === "content") content += tok.text;
    else reasoning += tok.text;
  }
  return { content, reasoning };
}
