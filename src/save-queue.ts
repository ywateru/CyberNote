export type SaveOutcome = { saved: true } | { saved: false; error: unknown };

/** The queue always drains; only the actual task's ACK means saved. */
export function enqueueSave(
  previous: Promise<unknown> | undefined,
  save: () => Promise<void>,
  failed: (error: unknown) => void,
  settled: () => void,
): Promise<SaveOutcome> {
  return (previous || Promise.resolve())
    .then(async (): Promise<SaveOutcome> => {
      await save();
      return { saved: true };
    })
    .catch((error): SaveOutcome => {
      failed(error);
      return { saved: false, error };
    })
    .finally(settled);
}
