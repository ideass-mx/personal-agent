import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CompanionProvider } from "./features/companion/CompanionContext";
import { MockProjectsProvider } from "./features/projects/MockProjectsContext";
import { AppProvider } from "./state/AppContext";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/companion.css";

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <CompanionProvider>
      <MockProjectsProvider>
        <App />
      </MockProjectsProvider>
    </CompanionProvider>
  </AppProvider>,
);
