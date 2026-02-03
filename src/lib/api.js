import { auth } from "./firebaseClient";

export async function apiFetch(path, init = {}) {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);

  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}