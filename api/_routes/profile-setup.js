import { sql } from "../_lib/db.js";
import { adminAuth } from "../_lib/firebaseAdmin.js";
import { getBearerToken, readJson, sendJson } from "../_lib/http.js";
import { isValidUsername, normalizeUsername } from "../_lib/validate.js";

const VALID_GENDERS = new Set(["male", "female", "other", "na"]);
const VALID_VIBES = new Set(["chillin", "on_fire", "ghost", "lowkey", "afk"]);

function parseDob(dobStr) {
  // Expect YYYY-MM-DD (from <input type="date" />)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) return null;

  // Use UTC to reduce timezone edge cases
  const d = new Date(`${dobStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getAgeUtc(dobDate) {
  const now = new Date();
  const yNow = now.getUTCFullYear();
  const mNow = now.getUTCMonth();
  const dNow = now.getUTCDate();

  const yDob = dobDate.getUTCFullYear();
  const mDob = dobDate.getUTCMonth();
  const dDob = dobDate.getUTCDate();

  let age = yNow - yDob;
  if (mNow < mDob || (mNow === mDob && dNow < dDob)) age--;
  return age;
}

function optionalString(value, maxLen = 2000) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value);
  if (s.length > maxLen) return null;
  return s;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: "missing_token" });

    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    let body;
    try {
      body = await readJson(req);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    const displayName = String(body.displayName || "").trim();
    const gender = String(body.gender || "");
    const dobStr = String(body.dob || "");
    const vibe = String(body.vibe || "");

    const username = normalizeUsername(body.username);

    // avatar is optional; if one is provided, prefer having both
    const avatarPublicId = optionalString(body.avatarPublicId, 300);
    const avatarUrl = optionalString(body.avatarUrl, 2000);

    // ---- validation ----
    if (displayName.length < 2) return sendJson(res, 400, { error: "bad_display_name" });
    if (!isValidUsername(username)) return sendJson(res, 400, { error: "bad_username" });
    if (!VALID_GENDERS.has(gender)) return sendJson(res, 400, { error: "bad_gender" });
    if (!VALID_VIBES.has(vibe)) return sendJson(res, 400, { error: "bad_vibe" });

    const dobDate = parseDob(dobStr);
    if (!dobDate) return sendJson(res, 400, { error: "bad_dob" });

    const age = getAgeUtc(dobDate);
    if (age < 13) return sendJson(res, 400, { error: "too_young" });

    // ---- atomic upsert with "username can't change here" rule ----
    // If profile exists and username differs, the WHERE clause prevents update,
    // and we can detect that and return username_already_set.
    const rows = await sql`
      with ensure_user as (
        insert into users (id)
        values (${uid})
        on conflict do nothing
        returning id
      ),
      existing as (
        select username
        from profiles
        where user_id = ${uid}
        limit 1
      ),
      upserted as (
        insert into profiles (
          user_id,
          display_name,
          username,
          gender,
          dob,
          vibe,
          avatar_public_id,
          avatar_url
        )
        values (
          ${uid},
          ${displayName},
          ${username},
          ${gender},
          ${dobStr}::date,
          ${vibe},
          ${avatarPublicId},
          ${avatarUrl}
        )
        on conflict (user_id) do update
        set
          display_name = excluded.display_name,
          gender = excluded.gender,
          dob = excluded.dob,
          vibe = excluded.vibe,
          avatar_public_id = excluded.avatar_public_id,
          avatar_url = excluded.avatar_url,
          updated_at = now()
        where profiles.username = excluded.username
        returning user_id
      )
      select
        (select count(*)::int from existing) as had_profile,
        (select count(*)::int from upserted) as did_upsert
    `;

    const { had_profile, did_upsert } = rows[0] || { had_profile: 0, did_upsert: 0 };

    if (did_upsert === 1) {
      return sendJson(res, 200, { ok: true });
    }

    if (had_profile === 1) {
      // profile exists but username differs => blocked
      return sendJson(res, 409, { error: "username_already_set" });
    }

    // Shouldn't happen; means insert didn't occur but no profile existed either
    return sendJson(res, 500, { error: "server_error" });
  } catch (e) {
    // Unique violation (username already used by someone else)
    if (e?.code === "23505") return sendJson(res, 409, { error: "username_taken" });

    return sendJson(res, 500, { error: "server_error" });
  }
}