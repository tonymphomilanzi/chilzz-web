/* eslint-disable no-unused-vars */
import { sql } from "../_lib/db.js";
import { adminAuth } from "../_lib/firebaseAdmin.js";
import { getBearerToken, sendJson } from "../_lib/http.js";
import { getQueryParam, isValidUsername, normalizeUsername } from "../_lib/validate.js";

function buildSuggestions(base) {
  // base is already normalized lowercase
  const out = [];
  out.push(base);

  for (let i = 1; i <= 8; i++) {
    const suffix = `_${i}`;
    const maxBaseLen = 25 - suffix.length;
    const b = base.slice(0, maxBaseLen);
    out.push(`${b}${suffix}`);
  }
  return Array.from(new Set(out)).slice(0, 6);
}

export default async function handler(req, res) {
  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: "missing_token" });
    await adminAuth().verifyIdToken(token);

    const raw = getQueryParam(req, "u");
    const username = normalizeUsername(raw);

    if (!isValidUsername(username)) {
      return sendJson(res, 200, {
        available: false,
        username,
        reason: "invalid",
        suggestions: [],
      });
    }

    const exists = await sql`
      select 1 from profiles where username = ${username} limit 1
    `;

    if (exists.length === 0) {
      return sendJson(res, 200, { available: true, username, suggestions: [] });
    }

    const candidates = buildSuggestions(username);
    const takenRows = await sql`
      select username from profiles where username = any(${candidates})
    `;
    const taken = new Set(takenRows.map((r) => r.username));
    const suggestions = candidates.filter((c) => !taken.has(c)).slice(0, 5);

    return sendJson(res, 200, { available: false, username, reason: "taken", suggestions });
  } catch (e) {
    return sendJson(res, 500, { error: "server_error" });
  }
}