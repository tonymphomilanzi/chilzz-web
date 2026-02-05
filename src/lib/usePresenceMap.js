import { useEffect, useMemo, useState } from "react";
import { db, doc, onSnapshot } from "@/lib/firestore";

export function usePresenceMap(uids) {
  const [map, setMap] = useState({});

  const key = useMemo(() => (uids || []).filter(Boolean).sort().join("|"), [uids]);

  useEffect(() => {
    const list = (uids || []).filter(Boolean);
    if (list.length === 0) {
      setMap({});
      return;
    }

    // MVP: listen per-user (fine for small lists)
    const unsubs = list.map((uid) =>
      onSnapshot(
        doc(db, "presence", uid),
        (snap) => {
          setMap((prev) => ({
            ...prev,
            [uid]: snap.exists() ? snap.data() : null,
          }));
        },
        (err) => console.error("presence listener error:", err)
      )
    );

    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}