import { createContext, useContext } from "react";
import type { ResolvedPresentation } from "./resolver";
export const PresentationContext = createContext<ResolvedPresentation | null>(null);
export const usePresentation = () => useContext(PresentationContext);
