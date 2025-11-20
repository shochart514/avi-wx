import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lobby.css"; // imported here OR in AviWxDashboard (either works)

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
