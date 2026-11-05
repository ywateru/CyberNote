// Tiptap uses ES2023 array methods; Android 11 can ship Chromium 91.
import "core-js/actual/array/find-last";
import "core-js/actual/array/find-last-index";
import "core-js/actual/array/at";
import "core-js/actual/structured-clone";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import RecordingWindow from "./RecordingWindow";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has("recording") ? <RecordingWindow /> : <App />}
  </React.StrictMode>,
);
