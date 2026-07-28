import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Overlay } from "./components/Overlay";
import "./styles/globals.css";

const isOverlay =
  new URLSearchParams(window.location.search).get("window") === "overlay";

if (isOverlay) {
  document.documentElement.classList.add("overlay-window");
  document.body.classList.add("overlay-window");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlay ? <Overlay /> : <App />}
  </React.StrictMode>,
);
