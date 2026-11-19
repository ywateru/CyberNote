import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { softwareUpdateClient } from "./client";
import type {
  SoftwareUpdateClient,
  UpdatePreferences,
  UpdateStatus,
} from "./types";
export const busyPhases = new Set([
  "checking",
  "downloading",
  "verifying",
  "staging",
  "awaiting_confirmation",
  "restarting",
]);
type RetryAction =
  | { type: "check" | "download" | "install" }
  | { type: "configure"; patch: Partial<UpdatePreferences> };
type UpdateContext = {
  status: UpdateStatus | null;
  error: string | null;
  busy: boolean;
  check(): Promise<void>;
  download(): Promise<void>;
  install(): Promise<void>;
  configure(patch: Partial<UpdatePreferences>): Promise<void>;
  retry(): Promise<void>;
};
const Context = createContext<UpdateContext | null>(null);
/** One provider at the main-window root, outside conditional Preferences mounting.
 * Native host owns checking frequency. This provider only observes status.
 * A fixture may inject a client; production always uses the fixed native feed. */
export function SoftwareUpdateProvider({
  children,
  client = softwareUpdateClient,
}: {
  children: ReactNode;
  client?: SoftwareUpdateClient;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failedAction, setFailedAction] = useState<RetryAction | null>(null);
  const life = useRef(0);
  const sequence = useRef(0);
  const action = useRef<number | null>(null);
  const errorSource = useRef<"poll" | "action" | null>(null);
  const current = useRef(status);
  current.current = status;
  useEffect(() => {
    const generation = ++life.current;
    ++sequence.current;
    action.current = null;
    setPending(false);
    setStatus(null);
    setError(null);
    setFailedAction(null);
    errorSource.current = null;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const request = sequence.current;
      if (action.current === null) {
        try {
          const next = await client.status();
          if (life.current === generation && request === sequence.current) {
            setStatus(next);
            if (errorSource.current === "poll") {
              errorSource.current = null;
              setError(null);
            }
          }
        } catch (err) {
          if (
            life.current === generation &&
            request === sequence.current &&
            errorSource.current !== "action"
          ) {
            errorSource.current = "poll";
            setError(String(err));
          }
        }
      }
      if (life.current === generation)
        timer = setTimeout(
          poll,
          busyPhases.has(current.current?.phase ?? "") ? 400 : 2000,
        );
    }
    void poll();
    return () => {
      ++life.current;
      clearTimeout(timer);
    };
  }, [client]);
  const run = useCallback(
    async (intent: RetryAction) => {
      // Own the exact attempted patch, independent of native status.retry or a caller mutation.
      const attempted: RetryAction =
        intent.type === "configure"
          ? { type: "configure", patch: { ...intent.patch } }
          : { ...intent };
      const operation = () =>
        attempted.type === "configure"
          ? client.configure(attempted.patch)
          : client[attempted.type]();
      if (action.current !== null) return;
      const generation = life.current;
      const request = ++sequence.current;
      action.current = request;
      setPending(true);
      setError(null);
      errorSource.current = null;
      try {
        const next = await operation();
        if (life.current === generation && request === sequence.current) {
          ++sequence.current;
          setStatus(next);
          setFailedAction(null);
        }
      } catch (err) {
        if (life.current === generation && request === sequence.current) {
          ++sequence.current;
          errorSource.current = "action";
          setFailedAction(attempted);
          setError(String(err));
          try {
            const next = await client.status();
            if (life.current === generation) setStatus(next);
          } catch {
            /* Preserve the original operation error. */
          }
        }
      } finally {
        if (action.current === request) {
          action.current = null;
          if (life.current === generation) setPending(false);
        }
      }
    },
    [client],
  );
  // Poll progress while a long command is pending, without allowing an older
  // status response to overwrite the command's final ready/error result.
  useEffect(() => {
    if (!pending) return;
    const generation = life.current;
    const request = sequence.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function progress() {
      try {
        const next = await client.status();
        if (
          !stopped &&
          life.current === generation &&
          sequence.current === request
        )
          setStatus(next);
      } catch {
        /* Command result owns errors while busy. */
      }
      if (!stopped) timer = setTimeout(progress, 350);
    }
    void progress();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [client, pending]);
  const value = useMemo<UpdateContext>(
    () => ({
      status,
      error,
      busy: pending || busyPhases.has(status?.phase ?? ""),
      check: () => run({ type: "check" }),
      download: () => run({ type: "download" }),
      install: () => run({ type: "install" }),
      configure: (patch) => run({ type: "configure", patch }),
      retry: () =>
        run(
          failedAction ?? {
            type:
              status?.retry === "download"
                ? "download"
                : status?.retry === "install"
                  ? "install"
                  : "check",
          },
        ),
    }),
    [run, status, error, pending, failedAction],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSoftwareUpdate(): UpdateContext {
  const context = useContext(Context);
  if (!context)
    throw new Error(
      "Mount one SoftwareUpdateProvider in the main window before using software update components",
    );
  return context;
}
