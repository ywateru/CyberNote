import type {
  BindingInfo,
  ToolbarState,
  ToolbarEvent,
  Intent,
} from "../plugins/tauri-plugin-notes-ui/guest-js";
export interface ToolbarProjection<C> {
  key: string;
  /** Trust scope excludes presentation/query, includes navigation, authority,
   * editor identity and document version. Only overlays may retain old search. */
  searchScope: string;
  state: Omit<ToolbarState, "revision">;
  context: C;
}
export interface ToolbarTransport {
  windowLabel: string;
  listen(handler: (event: ToolbarEvent) => void): Promise<() => void>;
  bind(state: ToolbarState): Promise<BindingInfo>;
  update(state: ToolbarState): Promise<BindingInfo>;
  inspect(): Promise<BindingInfo>;
  focusSearch(): Promise<BindingInfo>;
  unbind(): Promise<void>;
  /** Coalesce presentation updates; the desired trust scope changes immediately. */
  scheduleUpdate?(flush: () => void): () => void;
}
const codeOf = (error: unknown) => (error as { code?: string })?.code;

// One renderer, one binding, one in-flight update. This never owns document content.
export class NativeToolbar<C> {
  private desired?: ToolbarProjection<C>;
  private records = new Map<number, ToolbarProjection<C>>();
  // A native search event can be queued before an accepted visibility update.
  // Retain bounded provenance for search only; old actions remain invalid.
  private searchRecords = new Map<number, ToolbarProjection<C>>();
  private appliedOverlay = false;
  private binding?: BindingInfo;
  private unlisten?: () => void;
  private early: ToolbarEvent[] = [];
  private disposed = false;
  private running = false;
  private started = false;
  private revision = 0;
  private sequence = 0;
  private search?: { value: string; sequence: number; scope: string };
  private lastSearchSequence = 0;
  private waitSearch = 0;
  private composing = false;
  private appliedHash = "";
  private ready?: Promise<void>;
  private cancelScheduled?: () => void;
  constructor(
    private transport: ToolbarTransport,
    private intent: (intent: Intent, context: C, sequence: number) => void,
    private info: (info: BindingInfo) => void,
    private error: (error: unknown) => void,
  ) {}
  set(projection: ToolbarProjection<C>) {
    if (this.disposed) return;
    if (this.desired && this.desired.searchScope !== projection.searchScope) {
      this.searchRecords.clear();
      this.search = undefined;
      this.composing = false;
      this.waitSearch = 0;
    }
    this.desired = projection;
    // A caret-only transaction must refresh the bookmark without closing an open native menu.
    if (this.binding && this.appliedHash === this.hash(projection)) {
      this.records.set(this.binding.stateRevision, projection);
      return;
    }
    if (!this.started) {
      this.started = true;
      this.ready = this.start();
      void this.ready.catch(this.error);
    } else if (projection.state.contentOverlay || this.appliedOverlay) {
      this.cancelScheduled?.();
      this.cancelScheduled = undefined;
      void this.pump();
    } else if (!this.cancelScheduled && this.transport.scheduleUpdate) {
      this.cancelScheduled = this.transport.scheduleUpdate(() => {
        this.cancelScheduled = undefined;
        void this.pump();
      });
    } else if (!this.transport.scheduleUpdate) void this.pump();
  }
  private merged(projection: ToolbarProjection<C>) {
    const state = projection.state;
    const search =
      this.search?.scope === projection.searchScope ? this.search : undefined;
    const acknowledged = Math.max(
      this.lastSearchSequence,
      search?.sequence || 0,
    );
    if (state.search && state.search.acknowledgedEvent < acknowledged)
      return {
        ...projection,
        state: {
          ...state,
          search: {
            ...state.search,
            // A known old-scope event acknowledges transport sequence only. Its
            // value never crosses a navigation/document/authority boundary.
            value: search?.value ?? state.search.value,
            acknowledgedEvent: acknowledged,
          },
        },
      };
    return projection;
  }
  private hash(projection: ToolbarProjection<C>) {
    const merged = this.merged(projection);
    return JSON.stringify([merged.key, merged.state]);
  }
  private async start() {
    try {
      this.unlisten = await this.transport.listen((event) =>
        this.receive(event),
      );
      if (this.disposed) return;
      if (!this.desired) {
        this.started = false;
        this.unlisten();
        this.unlisten = undefined;
        return;
      }
      const projection = this.merged(this.desired);
      const revision = ++this.revision;
      this.records.set(revision, projection);
      const bound = await this.transport.bind({
        ...projection.state,
        revision,
      });
      this.binding = bound;
      this.appliedOverlay = !!projection.state.contentOverlay;
      this.appliedHash = this.hash(projection);
      if (this.disposed) return;
      this.info(bound);
      for (const event of this.early.splice(0)) this.receive(event);
      await this.pump();
    } catch (error) {
      this.disposed = true;
      this.unlisten?.();
      this.unlisten = undefined;
      throw error;
    } finally {
      if (this.disposed) await this.release();
    }
  }
  private receive(event: ToolbarEvent) {
    if (this.disposed || event.windowLabel !== this.transport.windowLabel)
      return;
    if (!this.binding) {
      if (this.early.length >= 128) {
        this.error(new Error("原生工具栏绑定期间事件过多，请关闭并重开窗口"));
        return;
      }
      this.early.push(event);
      return;
    }
    const projection =
      this.records.get(event.stateRevision) ||
      (event.intent.kind === "search"
        ? this.searchRecords.get(event.stateRevision)
        : undefined);
    if (
      event.bindingId !== this.binding.bindingId ||
      !Number.isSafeInteger(event.sequence) ||
      event.sequence <= this.sequence ||
      !projection
    )
      return;
    this.sequence = event.sequence;
    if (event.intent.kind === "search") {
      this.lastSearchSequence = event.sequence;
      this.composing = false;
      if (this.waitSearch <= event.sequence) this.waitSearch = 0;
      if (projection.searchScope !== this.desired?.searchScope) {
        void this.pump();
        return;
      }
      this.search = {
        value: event.intent.value,
        sequence: event.sequence,
        scope: projection.searchScope,
      };
      this.intent(event.intent, projection.context, event.sequence);
      // Acknowledge the actual native value immediately, before React publishes its new query.
      void this.pump();
      return;
    }
    if (event.intent.kind === "windowActivity") {
      this.info({
        ...this.binding,
        native: { ...this.binding.native, active: event.intent.active },
      });
      return;
    }
    if (
      event.stateRevision < this.binding.stateRevision ||
      projection.key !== this.desired?.key
    )
      return;
    this.intent(event.intent, projection.context, event.sequence);
  }
  private async pump() {
    if (
      this.running ||
      this.disposed ||
      !this.binding ||
      ((this.composing || this.waitSearch) &&
        !this.desired?.state.contentOverlay &&
        !this.appliedOverlay)
    )
      return;
    this.running = true;
    let failedHash: string | undefined;
    try {
      let staleSequence: number | undefined;
      while (!this.disposed && this.desired) {
        const projection = this.merged(this.desired),
          hash = this.hash(projection);
        if (hash === this.appliedHash) break;
        const revision = ++this.revision;
        this.records.set(revision, projection);
        try {
          const info = await this.transport.update({
            ...projection.state,
            revision,
          });
          if (this.disposed) break;
          this.binding = info;
          const wasOverlay = this.appliedOverlay;
          this.appliedOverlay = !!projection.state.contentOverlay;
          if (!this.appliedOverlay) {
            this.composing = false;
            this.waitSearch = 0;
          }
          this.appliedHash = hash;
          this.info(info);
          for (const [old, record] of this.records)
            if (old < info.stateRevision) {
              if (
                record.state.search &&
                typeof projection.searchScope === "string" &&
                projection.searchScope.length > 0 &&
                record.searchScope === projection.searchScope &&
                (wasOverlay ||
                  this.appliedOverlay ||
                  record.state.contentOverlay)
              )
                this.searchRecords.set(old, record);
              this.records.delete(old);
            }
          while (this.searchRecords.size > 64)
            this.searchRecords.delete(this.searchRecords.keys().next().value!);
        } catch (error) {
          failedHash = hash;
          this.records.delete(revision);
          if (this.disposed) break;
          if (codeOf(error) === "search_composition") {
            this.composing = true;
            break;
          }
          if (codeOf(error) === "stale_search") {
            const info = await this.transport.inspect();
            if (this.disposed) break;
            if ((this.search?.sequence || 0) < info.native.searchSequence) {
              this.waitSearch = info.native.searchSequence;
              break;
            }
            if (staleSequence === info.native.searchSequence)
              throw new Error("原生搜索确认序号无法同步，请重新打开窗口");
            staleSequence = info.native.searchSequence;
            // A native edit arrived during update. Retry only after merging its real event.
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (!this.disposed) this.error(error);
    } finally {
      this.running = false;
      // set() may have queued a protective overlay while the old request was
      // awaiting native rejection/inspection. Do not strand that newer desired
      // state, and never spin retrying the same rejected projection.
      if (!this.disposed && this.desired?.state.contentOverlay) {
        const latest = this.hash(this.desired);
        if (latest !== this.appliedHash && latest !== failedHash)
          void this.pump();
      }
    }
  }
  async focusSearch() {
    await this.ready;
    if (this.disposed || !this.binding) throw new Error("原生搜索尚未就绪");
    const info = await this.transport.focusSearch();
    if (!this.disposed) this.info(info);
  }
  invalidate(clean: (context: C) => void) {
    this.cancelScheduled?.();
    this.cancelScheduled = undefined;
    const contexts = new Set(
      [...this.records.values(), ...this.searchRecords.values()].map(
        (record) => record.context,
      ),
    );
    if (this.desired) contexts.add(this.desired.context);
    contexts.forEach(clean);
    this.records.clear();
    this.searchRecords.clear();
    this.search = undefined;
    this.composing = false;
    this.waitSearch = 0;
    this.desired = undefined;
    this.appliedHash = "";
    this.early = [];
  }
  stop() {
    this.cancelScheduled?.();
    this.cancelScheduled = undefined;
    this.disposed = true;
    this.desired = undefined;
    this.early = [];
    // The pending bind owns its release in start.finally.
    if (this.binding) void this.release();
    else if (!this.ready) this.unlisten?.();
  }
  private async release() {
    const binding = this.binding;
    this.binding = undefined;
    try {
      if (binding) await this.transport.unbind();
    } catch {
      /* Window destruction can already have removed the binding. */
    } finally {
      this.unlisten?.();
      this.unlisten = undefined;
      this.records.clear();
      this.searchRecords.clear();
    }
  }
}
