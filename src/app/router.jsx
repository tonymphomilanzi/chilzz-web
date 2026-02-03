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

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-zinc-200">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
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
        <AppLayout />
      </Protected>
    ),
    children: [
      { path: "pings", element: <PingsPage /> },
      { path: "rooms", element: <RoomsPage /> },
      { path: "discover", element: <DiscoverPage /> },
      { path: "chillshots", element: <ChillShotsPage /> },
      { path: "profile", element: <ProfilePage /> },
    ],
  },
]);