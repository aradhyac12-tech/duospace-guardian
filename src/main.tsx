import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// FIX AUDIT #2: Wrap the entire app in an ErrorBoundary so unhandled
// render-phase exceptions show a recovery screen instead of a blank white page.
// StrictMode is enabled to surface double-render issues and deprecated API usage
// during development (no effect in production builds).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary context="App">
      <App />
    </ErrorBoundary>
  </StrictMode>
);
