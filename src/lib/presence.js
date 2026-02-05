import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useMe } from "@/lib/me";
import { db, doc, serverTimestamp, setDoc } from "@/lib/firestore";

export function usePresenceWriter() {
  const { user } = useAuth();
  const { profile } = useMe();
  const heartbeatRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;

    const uid = user.uid;
    const ref = doc(db, "presence", uid);

    const vibe = profile?.vibe || "chillin";

    const setState = async (state) => {
      // Best-effort: Firestore writes might fail during unload; it's fine.
      await setDoc(
        ref,
        {
          uid,
          vibe,
          state, // "online" | "away" | "offline"
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        },
        { merge: true }
      );
    };

    const goOnline = () => setState("online");
    const goAway = () => setState("away");

    const onVisibility = () => {
      if (document.visibilityState === "visible") goOnline();
      else goAway();
    };

    const onFocus = () => goOnline();
    const onBlur = () => goAway();

    // initial
    goOnline();

    // heartbeat (keeps “online” fresh)
    heartbeatRef.current = setInterval(() => {
      goOnline();
    }, 30000);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);

      // mark away/offline-ish on cleanup
      goAway();
    };
  }, [user?.uid, profile?.vibe]);
}