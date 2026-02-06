import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { usePresenceWriter } from "@/lib/presence";

export default function AppLayout() {
  usePresenceWriter();

  const { pathname } = useLocation();

  // Hide bottom nav only inside an open chat thread
  const inVibeThread = /^\/app\/vibes\/[^/]+$/.test(pathname);
  const showBottomNav = !inVibeThread;

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col md:flex-row min-h-0">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className={`flex-1 flex min-h-0 ${showBottomNav ? "pb-14" : "pb-0"} md:pb-0`}>
        <div className="flex-1 md:border-l border-border min-h-0">
          <Outlet />
        </div>

        {/* Right panel desktop only */}
        <aside className="hidden lg:block w-[340px] border-l border-border bg-background/60" />
      </main>

      {/* Mobile bottom tabs */}
      {showBottomNav ? <BottomNav /> : null}
    </div>
  );
}