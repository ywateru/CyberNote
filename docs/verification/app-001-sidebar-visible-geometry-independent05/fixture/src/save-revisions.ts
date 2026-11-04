// An editor's unsaved chain keeps the revision it was based on. A newer
// workspace snapshot cannot authorize that old document to overwrite a peer.
export class SaveRevisions {
  private baseline = new Map<string, number>();
  observe(id: string, revision: number, pending: boolean) {
    if (!pending) this.baseline.set(id, revision);
  }
  confirmed(id: string, revision: number) {
    this.baseline.set(id, revision);
  }
  expected(id: string) {
    return this.baseline.get(id) || 0;
  }
}
