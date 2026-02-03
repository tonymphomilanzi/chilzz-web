const USERNAME_RE = /^[a-z0-9_]{5,25}$/;

export function normalizeUsername(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 25);
}

export function isValidUsername(u) {
  return USERNAME_RE.test(u);
}

export function getQueryParam(req, key) {
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get(key);
}