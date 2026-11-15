// Tiptap uses ES2023 array methods; Android 11 can ship Chromium 91.
import "core-js/actual/array/find-last";
import "core-js/actual/array/find-last-index";
import "core-js/actual/array/at";
import "core-js/actual/structured-clone";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./desktop.css";
import "./button-feedback.css";
import "./design-tokens.css";
import "./design-controls.css";
import { installButtonFeedback } from "./button-feedback";
const removeButtonFeedback = installButtonFeedback(document);
if (import.meta.hot) import.meta.hot.dispose(removeButtonFeedback);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
