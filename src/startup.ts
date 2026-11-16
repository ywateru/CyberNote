import type { AppearanceV2 } from "./themes/appearance";
type Startup = {
  ready(): void;
  fail(): void;
  theme(value: string): void;
  appearance(value: AppearanceV2): void;
};

export type StartupGates = Readonly<{
  loading: boolean;
  workspaceLoaded: boolean;
  syncCover: boolean;
  synchronizing: boolean;
  editorSatisfied: boolean;
  nativeRequired: boolean;
  nativeInfoPresent: boolean;
  errorPresent: boolean;
  startupReady: boolean;
}>;
type StartupPhase = "notScheduled" | "frame1" | "frame2" | "fallback" | "ready" | "cancelled";
type StartupDiagnostic = Readonly<{
  schema: 1;
  gates: StartupGates;
  phase: StartupPhase;
}>;

declare global {
  interface Window {
    __CYBERNOTE_STARTUP__?: Startup;
    __CYBERNOTE_STARTUP_DIAGNOSTIC__?: StartupDiagnostic;
  }
}

let diagnosticGates: StartupGates | undefined;
let diagnosticPhase: StartupPhase = "notScheduled";
function publishDiagnostic() {
  if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1" && diagnosticGates) {
    window.__CYBERNOTE_STARTUP_DIAGNOSTIC__ = Object.freeze({
      schema: 1,
      gates: diagnosticGates,
      phase: diagnosticPhase,
    });
  }
}
function phase(value: StartupPhase) {
  if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
    diagnosticPhase = value;
    publishDiagnostic();
  }
}

let generation = 0;
let completed = false;
let cancelPending: (() => void) | undefined;

export const startup = {
  ready() { window.__CYBERNOTE_STARTUP__?.ready(); },
  fail() { window.__CYBERNOTE_STARTUP__?.fail(); },
  appearance(value: AppearanceV2) { window.__CYBERNOTE_STARTUP__?.appearance(value); },
  theme(value: string) { window.__CYBERNOTE_STARTUP__?.theme(value); },
  // Observation only: scheduling never reads these gates or the public snapshot.
  diagnostic(gates: StartupGates) {
    if (import.meta.env.DEV && import.meta.env.VITE_NOTES_DEBUG === "1") {
      diagnosticGates = Object.freeze({ ...gates });
      publishDiagnostic();
    }
  },
  // The caller owns this only while its committed startupReady gate is true.
  // A timer releases the cosmetic paint wait, not any workspace/editor gate.
  scheduleReady(): () => void {
    cancelPending?.();
    if (completed) return () => {};
    const owner = ++generation;
    let live = true;
    let first: number | undefined;
    let second: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      if (first !== undefined) cancelAnimationFrame(first);
      if (second !== undefined) cancelAnimationFrame(second);
      if (timer !== undefined) clearTimeout(timer);
    };
    const current = () => live && !completed && owner === generation;
    const finish = (fallback: boolean) => {
      if (!current()) return;
      live = false;
      completed = true;
      cancelPending = undefined;
      clear();
      if (fallback) phase("fallback");
      phase("ready");
      startup.ready();
    };
    const cancel = () => {
      if (!current()) return;
      live = false;
      ++generation;
      cancelPending = undefined;
      clear();
      phase("cancelled");
    };
    cancelPending = cancel;
    phase("frame1");
    first = requestAnimationFrame(() => {
      if (!current()) return;
      phase("frame2");
      second = requestAnimationFrame(() => finish(false));
    });
    timer = setTimeout(() => finish(true), 250);
    return cancel;
  },
};
