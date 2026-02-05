import { useEffect, useMemo, useRef, useState } from "react";

function createAudio(src, volume = 0.5) {
  const a = new Audio(src);
  a.preload = "auto";
  a.volume = volume;
  return a;
}

/**
 * Web autoplay restrictions:
 * audio.play() may fail until a user gesture occurs.
 * We "unlock" sound after first click/keydown.
 */
export function useSfx() {
  const [enabled, setEnabled] = useState(() => {
    const v = localStorage.getItem("chilzz.sfx");
    return v === null ? true : v === "1";
  });

  const unlockedRef = useRef(false);

  const sendAudio = useMemo(() => createAudio("/sounds/vibe-send.mp3", 0.35), []);
  const receiveAudio = useMemo(() => createAudio("/sounds/vibe-receive.mp3", 0.45), []);

  useEffect(() => {
    localStorage.setItem("chilzz.sfx", enabled ? "1" : "0");
  }, [enabled]);

  useEffect(() => {
    const unlock = async () => {
      if (unlockedRef.current) return;
      try {
        // attempt a tiny play/pause to unlock (some browsers require it)
        sendAudio.muted = true;
        await sendAudio.play();
        sendAudio.pause();
        sendAudio.currentTime = 0;
      } catch {
        // ignore
      } finally {
        sendAudio.muted = false;
        unlockedRef.current = true;
      }
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [sendAudio]);

  async function play(aud) {
    if (!enabled) return;
    try {
      // restart sound quickly for rapid sends
      aud.currentTime = 0;
      await aud.play();
    } catch {
      // autoplay blocked or tab restrictions; safe to ignore
    }
  }

  return {
    enabled,
    setEnabled,
    playSend: () => play(sendAudio),
    playReceive: () => play(receiveAudio),
  };
}