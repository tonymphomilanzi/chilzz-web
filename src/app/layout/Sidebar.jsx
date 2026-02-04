/* eslint-disable no-unused-vars */
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

{ to: "/app/vibes", label: "Vibes", Icon: ChatBubbleLeftRightIcon },
  { to: "/app/rooms", label: "Rooms", Icon: UsersIcon },
  { to: "/app/discover", label: "Discover", Icon: MagnifyingGlassIcon },
  { to: "/app/chillshots", label: "ChillShots", Icon: CameraIcon },
  { to: "/app/profile", label: "Profile", Icon: UserCircleIcon },
];

// ...imports unchanged
export default function Sidebar() {
  return (
    <nav className="w-[72px] border-r border-border bg-background flex flex-col items-center py-3 gap-2">
      <div className="h-10 w-10 rounded-xl bg-card border border-border grid place-items-center mb-2">
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
                ? "bg-card border-border"
                : "hover:bg-card/60 hover:border-border"
            )
          }
        >
          <Icon className="h-6 w-6" />
        </NavLink>
      ))}
    </nav>
  );
}