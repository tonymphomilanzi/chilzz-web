import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function createAudio(src, volume = 0.5) {
  const a = new Audio(src);
  a.preload = "auto";
  a.volume = volume;
  return a;
}

/**
 * chilZz SFX hook
 * Files should be in /public/sounds/:
 *  - /sounds/vibe-send.mp3
 *  - /sounds/vibe-receive.mp3
 */
export function useSfx() {
  const [enabled, setEnabled] = useState(() => {
    const v = localStorage.getItem("chilzz.sfx");
    return v === null ? true : v === "1";
  });

  // Keep track of browser audio unlock
  const unlockedRef = useRef(false);

  // Create audio objects once
  const sendAudio = useMemo(() => createAudio("/sounds/vibe-send.mp3", 0.35), []);
  const receiveAudio = useMemo(() => createAudio("/sounds/vibe-receive.mp3", 0.45), []);

  // Persist preference
  useEffect(() => {
    localStorage.setItem("chilzz.sfx", enabled ? "1" : "0");
  }, [enabled]);

  // Unlock audio after first user gesture (autoplay policies)
  useEffect(() => {
    const unlock = async () => {
      if (unlockedRef.current) return;

      try {
        // Some browsers only unlock after a successful play()
        sendAudio.muted = true;
        await sendAudio.play();
        sendAudio.pause();
        sendAudio.currentTime = 0;
      } catch {
        // Ignore; will keep trying on next gesture
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

  // Base play function (stable)
  const play = useCallback(
    async (aud) => {
      if (!enabled) return;

      try {
        // reset so rapid sounds work
        aud.currentTime = 0;
        await aud.play();
      } catch {
        // Autoplay blocked / background tab / user settings
      }
    },
    [enabled]
  );

  // Stable helpers (IMPORTANT: prevents effect dependency loops)
  const playSend = useCallback(() => play(sendAudio), [play, sendAudio]);
  const playReceive = useCallback(() => play(receiveAudio), [play, receiveAudio]);

  return {
    enabled,
    setEnabled,
    playSend,
    playReceive,
  };
}