import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// Single-file builds (e.g. a hosted preview page) can't use real URLs, so they use an in-memory router.
const Router = import.meta.env.VITE_MEMORY_ROUTER ? MemoryRouter : BrowserRouter;
const routerProps = import.meta.env.VITE_MEMORY_ROUTER ? {} : { basename: import.meta.env.BASE_URL };

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Router {...routerProps}>
      <App />
    </Router>
  </StrictMode>
);
