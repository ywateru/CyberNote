// Search selection is a projection. The real folder/note selection remains
// untouched so clearing the query restores it, including its mounted editor.
export function projectSearchNote(input: {
  searching: boolean;
  baseNoteId: string | null;
  searchNoteId: string | null;
  resultIds: readonly string[];
}): string | null {
  if (!input.searching) return input.baseNoteId;
  if (input.resultIds.length === 1) return input.resultIds[0];
  const selected = input.searchNoteId || input.baseNoteId;
  return selected && input.resultIds.includes(selected) ? selected : null;
}
