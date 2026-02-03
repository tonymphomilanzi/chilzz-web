import { auth } from "./firebaseClient";

export async function apiFetch(path, init = {}) {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);

  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });

  const text = await res.text(); // read once

  if (!res.ok) {
    // server returns JSON like {"error":"..."} — keep it in message for parsing
    throw new Error(text || `Request failed (${res.status})`);
  }

  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("API returned non-JSON response.");
  }
}