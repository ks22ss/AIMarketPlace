const defaultMaxChars = 1200;
const defaultOverlap = 150;

export function chunkText(
  text: string,
  maxChars: number = defaultMaxChars,
  overlap: number = defaultOverlap,
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + maxChars);
    const slice = normalized.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push(slice);
    }
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
