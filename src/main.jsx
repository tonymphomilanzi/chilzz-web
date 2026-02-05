import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./app/App";
import { AuthProvider } from "./lib/auth";
import { MeProvider } from "./lib/me";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <MeProvider>
        <App />
      </MeProvider>
    </AuthProvider>
  </React.StrictMode>
);