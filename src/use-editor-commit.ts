import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** A parent layout effect runs after the mounted editor hosts' layout effects.
 * A trusted read alone cannot establish that their editability gate committed. */
export function useEditorCommit() {
  const [, requestCommit] = useState(0);
  const mounted = useRef(false);
  const pending = useRef(
    new Set<{
      complete: () => void;
      cancel: () => void;
    }>(),
  );
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const waiter of [...pending.current]) waiter.cancel();
    };
  }, []);
  useLayoutEffect(() => {
    for (const waiter of [...pending.current]) waiter.complete();
  });
  return useCallback((signal: AbortSignal) => {
    if (!mounted.current || signal.aborted)
      return Promise.reject(Error("原录音或编辑器已关闭，音频仍保留"));
    return new Promise<void>((resolve, reject) => {
      const remove = () => {
        pending.current.delete(waiter);
        signal.removeEventListener("abort", waiter.cancel);
      };
      const waiter = {
        complete: () => {
          remove();
          resolve();
        },
        cancel: () => {
          remove();
          reject(Error("原录音或编辑器已关闭，音频仍保留"));
        },
      };
      pending.current.add(waiter);
      signal.addEventListener("abort", waiter.cancel, { once: true });
      requestCommit((value) => value + 1);
    });
  }, []);
}
