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

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 h-14 bg-background/90 backdrop-blur border-t border-border flex items-center justify-around z-50">
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            clsx(
              "h-10 w-10 rounded-xl grid place-items-center transition border",
              isActive ? "text-primary border-border bg-card" : "text-foreground border-transparent"
            )
          }
        >
          <Icon className="h-6 w-6" />
        </NavLink>
      ))}
    </nav>
  );
}