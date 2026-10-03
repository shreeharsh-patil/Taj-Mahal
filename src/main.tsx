import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Note: StrictMode is intentionally not used — it would mount the WebGL experience twice in development.
createRoot(document.getElementById("root")!).render(<App />);
