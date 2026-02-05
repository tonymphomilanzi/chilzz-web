import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { usePresenceWriter } from "@/lib/presence";

export default function AppLayout() {
  usePresenceWriter();
  return (
    <div className="h-screen w-screen bg-background text-foreground flex">
      <Sidebar />
      <main className="flex-1 flex">
        <div className="flex-1 border-l border-border">
          <Outlet />
        </div>
        <aside className="hidden lg:block w-[340px] border-l border-border bg-background/60" />
      </main>
    </div>
  );
}