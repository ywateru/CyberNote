import { createContext, useContext, useEffect, useState } from "react";
import { native } from "../bridge";
import { createMobileLayout } from "./layout";

export const MobileInteractionContext = createContext<boolean | null>(null);

/** App supplies its stable identity, including to editor node views/portals.
 * Standalone attachment surfaces use the same resolver, never their own breakpoint. */
export function useMobileInteraction() {
  const context = useContext(MobileInteractionContext);
  const [resolve] = useState(() => createMobileLayout(native, navigator.userAgent,
    !!new URLSearchParams(location.search).get("note")));
  const [fallback, setFallback] = useState(() => resolve(window.innerWidth));
  useEffect(() => {
    if (context !== null) return;
    const changed = () => setFallback(resolve(window.innerWidth));
    window.addEventListener("resize", changed);
    return () => window.removeEventListener("resize", changed);
  }, [context, resolve]);
  return context ?? fallback;
}
