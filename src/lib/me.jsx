/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

const MeCtx = createContext(null);

export function MeProvider({ children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null); // neon profile

  async function refresh() {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const me = await apiFetch("/api/me");
      setProfile(me?.profile || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const value = useMemo(() => ({ loading, profile, refresh }), [loading, profile]);

  return <MeCtx.Provider value={value}>{children}</MeCtx.Provider>;
}

export function useMe() {
  const v = useContext(MeCtx);
  if (!v) throw new Error("useMe must be used within <MeProvider />");
  return v;
}