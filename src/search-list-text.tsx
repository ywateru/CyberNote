import type { ReactNode } from "react";

// Use the same locale-lowercase literal semantics as the existing result set.
// Map folded offsets back to original code points: e.g. İ expands when folded,
// but highlighting must retain the original glyph and the following text.
function literalMatches(text: string, query: string) {
  if (!query) return [];
  const folded = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const offsets: { start: number; end: number }[] = [];
  let sourceOffset = 0;
  for (const character of text) {
    const range = { start: sourceOffset, end: sourceOffset + character.length };
    for (let i = 0; i < character.toLocaleLowerCase().length; i++)
      offsets.push(range);
    sourceOffset = range.end;
  }
  const matches: { index: number; text: string }[] = [];
  let from = 0;
  while (from <= folded.length - needle.length) {
    const index = folded.indexOf(needle, from);
    if (index < 0) break;
    const start = offsets[index].start;
    const end = offsets[index + needle.length - 1].end;
    const previous = matches.at(-1);
    if (previous && start < previous.index + previous.text.length)
      previous.text = text.slice(previous.index, end);
    else matches.push({ index: start, text: text.slice(start, end) });
    from = index + needle.length;
  }
  return matches;
}

export function searchListText(text: string, query: string): ReactNode {
  const matches = literalMatches(text, query);
  if (!matches.length) return text;
  const parts: ReactNode[] = [];
  let from = 0;
  for (const match of matches) {
    const index = match.index!;
    parts.push(text.slice(from, index));
    parts.push(
      <span className="search-match" key={index}>
        {match.text}
      </span>,
    );
    from = index + match.text.length;
  }
  parts.push(text.slice(from));
  return parts;
}

export function searchListSnippet(text: string, query: string): string {
  const match = literalMatches(text, query)[0];
  if (!match) return text;
  // Keep the first body match near the start of the single-line preview. Work
  // in code points so the context boundary cannot split an emoji/surrogate.
  const prefix = Array.from(text.slice(0, match.index));
  const context = prefix.slice(-6).join("");
  const start = match.index! - context.length;
  return `${start ? "…" : ""}${text.slice(start)}`;
}
