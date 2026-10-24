import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./styles.css";
import { App } from "./App";

async function bootstrap() {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installMockIpc } = await import("./dev/mockIpc");
    installMockIpc();
  }
  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

void bootstrap();
