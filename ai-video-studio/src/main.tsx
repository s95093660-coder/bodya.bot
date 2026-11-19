import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { setPlatform } from "./core/platform";
import { createTauriPlatform, isTauri } from "./platform/tauri";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (isTauri()) {
  setPlatform(createTauriPlatform());
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  root.render(
    <div style={{ padding: 32, fontFamily: "system-ui" }}>
      AI Video Studio запускается как десктоп-приложение: <code>npm run app:dev</code>. Для headless-режима: <code>npm run cli -- --help</code>.
    </div>,
  );
}
