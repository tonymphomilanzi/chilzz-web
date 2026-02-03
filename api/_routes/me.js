import { sql } from "../_lib/db.js";
import { adminAuth } from "../_lib/firebaseAdmin.js";
import { getBearerToken, sendJson } from "../_lib/http.js";

export default async function me(req, res) {
  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: "missing_token" });

    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    await sql`insert into users (id) values (${uid}) on conflict do nothing`;

    const rows = await sql`
      select
        user_id,
        username,
        display_name,
        gender,
        dob,
        vibe,
        avatar_url,
        avatar_public_id
      from profiles
      where user_id = ${uid}
      limit 1
    `;

    if (rows.length === 0) return sendJson(res, 200, { onboarded: false });
    return sendJson(res, 200, { onboarded: true, profile: rows[0] });
  } catch {
    return sendJson(res, 401, { error: "invalid_token" });
  }
}