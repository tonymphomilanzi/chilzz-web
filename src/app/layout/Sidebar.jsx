import React from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import {
  ChatBubbleLeftRightIcon,
  UsersIcon,
  MagnifyingGlassIcon,
  CameraIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

const items = [
  { to: "/app/pings", label: "Pings", Icon: ChatBubbleLeftRightIcon },
  { to: "/app/rooms", label: "Rooms", Icon: UsersIcon },
  { to: "/app/discover", label: "Discover", Icon: MagnifyingGlassIcon },
  { to: "/app/chillshots", label: "ChillShots", Icon: CameraIcon },
  { to: "/app/profile", label: "Profile", Icon: UserCircleIcon },
];

export default function Sidebar() {
  return (
    <nav className="w-[72px] border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-3 gap-2">
      <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 grid place-items-center mb-2">
        <span className="text-sm font-semibold">cz</span>
      </div>

      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            clsx(
              "h-11 w-11 rounded-xl grid place-items-center transition",
              "border border-transparent",
              isActive
                ? "bg-zinc-900 border-zinc-700"
                : "hover:bg-zinc-900/60 hover:border-zinc-800"
            )
          }
        >
          <Icon className="h-6 w-6" />
        </NavLink>
      ))}
    </nav>
  );
}