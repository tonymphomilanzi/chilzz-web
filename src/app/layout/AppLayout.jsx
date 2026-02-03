import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <main className="flex-1 flex">
        <div className="flex-1 border-l border-zinc-800">
          <Outlet />
        </div>
        {/* right panel placeholder (details / members / info) */}
        <aside className="hidden lg:block w-[340px] border-l border-zinc-800 bg-zinc-950/60" />
      </main>
    </div>
  );
}