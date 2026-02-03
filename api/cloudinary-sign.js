/* eslint-disable no-undef */
import crypto from "crypto";
import { adminAuth } from "./_lib/firebaseAdmin.js";
import { getBearerToken, readJson, sendJson } from "./_lib/http.js";

function signCloudinaryParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });

  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: "missing_token" });

    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const body = await readJson(req);
    const kind = String(body.kind || "avatar"); // "avatar" for now

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const baseFolder = process.env.CLOUDINARY_BASE_FOLDER || "chilzz";

    if (!cloudName || !apiKey || !apiSecret) {
      return sendJson(res, 500, { error: "cloudinary_env_missing" });
    }

    // You can expand later for chillshots etc.
    const folder =
      kind === "avatar" ? `${baseFolder}/avatars/${uid}` : `${baseFolder}/misc/${uid}`;

    const timestamp = Math.floor(Date.now() / 1000);

    // Keep signed params minimal: only include what you actually send from client.
    const paramsToSign = { folder, timestamp };

    const signature = signCloudinaryParams(paramsToSign, apiSecret);

    return sendJson(res, 200, {
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
    });
  } catch (e) {
    return sendJson(res, 401, { error: "invalid_token" });
  }
}