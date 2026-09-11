import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MockProjectsProvider } from "./features/projects/MockProjectsContext";
import { AppProvider } from "./state/AppContext";
import "./styles/tokens.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <MockProjectsProvider>
      <App />
    </MockProjectsProvider>
  </AppProvider>,
);
