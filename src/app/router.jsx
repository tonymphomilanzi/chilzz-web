/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

import AppLayout from "./layout/AppLayout";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import PingsPage from "./pages/PingsPage";
import RoomsPage from "./pages/RoomsPage";
import DiscoverPage from "./pages/DiscoverPage";
import ChillShotsPage from "./pages/ChillShotsPage";
import ProfilePage from "./pages/ProfilePage";

import { apiFetch } from "../lib/api";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

function OnboardingGate({ children }) {
  const { user } = useAuth();
  const [state, setState] = React.useState("loading"); // loading | ok | need

  React.useEffect(() => {
    let alive = true;
    async function run() {
      try {
        if (!user) return;
        const data = await apiFetch("/api/me");
        if (!alive) return;
        setState(data.onboarded ? "ok" : "need");
      } catch {
        if (!alive) return;
        setState("need");
      }
    }
    run();
    return () => (alive = false);
  }, [user]);

  if (state === "loading") return <div className="p-6">Loading...</div>;
  if (state === "need") return <Navigate to="/onboarding" replace />;
  return children;
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/app/pings" replace /> },
  { path: "/auth", element: <AuthPage /> },

  {
    path: "/onboarding",
    element: (
      <Protected>
        <OnboardingPage />
      </Protected>
    ),
  },

  {
    path: "/app",
    element: (
      <Protected>
        <OnboardingGate>
          <AppLayout />
        </OnboardingGate>
      </Protected>
    ),
    children: [
      { path: "pings", element: <PingsPage /> },
      { path: "pings/:chatId", element: <PingsPage /> },
      { path: "rooms", element: <RoomsPage /> },
      { path: "discover", element: <DiscoverPage /> },
      { path: "chillshots", element: <ChillShotsPage /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
]);