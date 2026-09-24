import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ShuttleApp } from "@/game/ShuttleApp";
import "../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShuttleApp />
  </StrictMode>,
);
