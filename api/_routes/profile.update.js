import { sql } from "../_lib/db.js";
import { adminAuth } from "../_lib/firebaseAdmin.js";
import { getBearerToken, readJson, sendJson } from "../_lib/http.js";

const VALID_GENDERS = new Set(["male", "female", "other", "na"]);
const VALID_VIBES = new Set(["chillin", "on_fire", "ghost", "lowkey", "afk"]);

function parseDob(dobStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) return null;
  const d = new Date(`${dobStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function ageUtc(d) {
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function optionalString(v, maxLen) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (s.length > maxLen) return null;
  return s;
}

export default async function profileUpdate(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });

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

    const avatarPublicId = optionalString(body.avatarPublicId, 300);
    const avatarUrl = optionalString(body.avatarUrl, 2000);

    if (displayName.length < 2) return sendJson(res, 400, { error: "bad_display_name" });
    if (!VALID_GENDERS.has(gender)) return sendJson(res, 400, { error: "bad_gender" });
    if (!VALID_VIBES.has(vibe)) return sendJson(res, 400, { error: "bad_vibe" });

    const d = parseDob(dobStr);
    if (!d) return sendJson(res, 400, { error: "bad_dob" });
    if (ageUtc(d) < 13) return sendJson(res, 400, { error: "too_young" });

    const rows = await sql`
      update profiles
      set
        display_name = ${displayName},
        gender = ${gender},
        dob = ${dobStr}::date,
        vibe = ${vibe},
        avatar_public_id = ${avatarPublicId},
        avatar_url = ${avatarUrl},
        updated_at = now()
      where user_id = ${uid}
      returning user_id
    `;

    if (rows.length === 0) return sendJson(res, 409, { error: "not_onboarded" });
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 500, { error: "server_error" });
  }
}