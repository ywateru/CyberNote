import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { EditorSession } from "./controller";
import { browserSessionPlatform } from "./platform";

export function useEditorSession() {
  const [session] = useState(() => new EditorSession(browserSessionPlatform()));
  const state = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.snapshot,
  );
  useLayoutEffect(() => {
    session.mount();
    const resize = () => session.viewportChanged(window.innerHeight);
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      session.dispose();
    };
  }, [session]);
  useLayoutEffect(() => {
    session.reconcile();
  });
  return { session, state };
}
