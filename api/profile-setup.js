/* eslint-disable no-unused-vars */
/* eslint-disable no-empty */
import { sql } from "./_lib/db.js";
import { adminAuth } from "./_lib/firebaseAdmin.js";
import { getBearerToken, readJson, sendJson } from "./_lib/http.js";
import { isValidUsername, normalizeUsername } from "./_lib/validate.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });

  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: "missing_token" });

    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const body = await readJson(req);


    const avatarPublicId = body.avatarPublicId ? String(body.avatarPublicId) : null;
    const avatarUrl = body.avatarUrl ? String(body.avatarUrl) : null;

    
    const displayName = String(body.displayName || "").trim();
    const gender = String(body.gender || "");
    const dob = String(body.dob || ""); // "YYYY-MM-DD"
    const vibe = String(body.vibe || "");

    const username = normalizeUsername(body.username);

    if (displayName.length < 2) return sendJson(res, 400, { error: "bad_display_name" });
    if (!isValidUsername(username)) return sendJson(res, 400, { error: "bad_username" });

    // Minimal validation; DB constraints also enforce allowed values.
    if (!dob) return sendJson(res, 400, { error: "bad_dob" });

    await sql`BEGIN`;

    await sql`insert into users (id) values (${uid}) on conflict do nothing`;

    // Prevent changing username here if profile already exists
    const existing = await sql`select username from profiles where user_id = ${uid} limit 1`;
    if (existing.length && existing[0].username !== username) {
      await sql`ROLLBACK`;
      return sendJson(res, 409, { error: "username_already_set" });
    }



  await sql`
  insert into profiles (user_id, display_name, username, gender, dob, vibe, avatar_public_id, avatar_url)
  values (${uid}, ${displayName}, ${username}, ${gender}, ${dob}::date, ${vibe}, ${avatarPublicId}, ${avatarUrl})
  on conflict (user_id) do update
  set
    display_name = excluded.display_name,
    gender = excluded.gender,
    dob = excluded.dob,
    vibe = excluded.vibe,
    avatar_public_id = excluded.avatar_public_id,
    avatar_url = excluded.avatar_url,
    updated_at = now()
`;

    await sql`COMMIT`;
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    try { await sql`ROLLBACK`; } catch {}

    // Unique violation (username taken) => 23505
    if (e?.code === "23505") return sendJson(res, 409, { error: "username_taken" });

    return sendJson(res, 500, { error: "server_error" });
  }
}
