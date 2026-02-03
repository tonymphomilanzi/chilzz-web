import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const USERNAME_RE = /^[a-z0-9_]{5,25}$/;

export function normalizeUsername(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 25);
}

function isValidUsername(u) {
  return USERNAME_RE.test(u);
}

export function useUsernameAvailability(username) {
  const [status, setStatus] = useState("idle"); // idle|invalid|checking|available|taken|error
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  // prevents stale responses overwriting latest input
  const seq = useRef(0);

  useEffect(() => {
    const u = username;

    setSuggestions([]);

    if (!u) {
      setStatus("idle");
      setMessage("");
      return;
    }

    if (!isValidUsername(u)) {
      setStatus("invalid");
      setMessage("Use 5–25 chars: letters, numbers, underscore.");
      return;
    }

    const requestId = ++seq.current;
    const ac = new AbortController();

    setStatus("checking");
    setMessage("Checking availability...");

    const debounce = setTimeout(async () => {
      const hardTimeout = setTimeout(() => ac.abort(), 8000);

      try {
        const data = await apiFetch(`/api/username-check?u=${encodeURIComponent(u)}`, {
          signal: ac.signal,
        });

        if (seq.current !== requestId) return;

        if (data.available) {
          setStatus("available");
          setMessage("Available.");
          setSuggestions([]);
          return;
        }

        if (data.reason === "taken") {
          setStatus("taken");
          setMessage("Taken. Pick a suggestion.");
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
          return;
        }

        setStatus("invalid");
        setMessage("Use 5–25 chars: letters, numbers, underscore.");
      } catch (e) {
        if (seq.current !== requestId) return;
        setStatus("error");
        setMessage("Could not check right now. Try again.");
      } finally {
        clearTimeout(hardTimeout);
      }
    }, 350);

    return () => {
      clearTimeout(debounce);
      ac.abort();
    };
  }, [username]);

  return { status, message, suggestions, isValid: status === "available" };
}