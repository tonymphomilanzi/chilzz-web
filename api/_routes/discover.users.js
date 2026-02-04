// api/_routes/discover.users.js
import { sql } from "../_lib/db.js";
import { adminAuth } from "../_lib/firebaseAdmin.js";
import { getBearerToken, sendJson } from "../_lib/http.js";

export default async function discoverUsers(req, res) {
  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: "missing_token" });

    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const rows = await sql`
      select user_id, username, display_name, avatar_url, vibe, discoverable
      from profiles
      where discoverable = true
        and user_id <> ${uid}
      order by updated_at desc
      limit 30
    `;

    return sendJson(res, 200, { users: rows });
  } catch {
    return sendJson(res, 401, { error: "invalid_token" });
  }
}