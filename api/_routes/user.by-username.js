import { sql } from "../_lib/db.js";
import { adminAuth } from "../_lib/firebaseAdmin.js";
import { getBearerToken, sendJson } from "../_lib/http.js";
import { getQueryParam, normalizeUsername, isValidUsername } from "../_lib/validate.js";

export default async function userByUsername(req, res) {
  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: "missing_token" });

    await adminAuth().verifyIdToken(token);

    const raw = getQueryParam(req, "u");
    const username = normalizeUsername(raw);

    if (!isValidUsername(username)) {
      return sendJson(res, 400, { error: "bad_username" });
    }

    const rows = await sql`
      select
        user_id,
        username,
        display_name,
        avatar_url
      from profiles
      where username = ${username}
      limit 1
    `;

    if (rows.length === 0) return sendJson(res, 404, { error: "not_found" });

    return sendJson(res, 200, { user: rows[0] });
  } catch {
    return sendJson(res, 401, { error: "invalid_token" });
  }
}