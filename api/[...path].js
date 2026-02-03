import { sendJson } from "./_lib/http.js";

import me from "./_routes/me.js";
import usernameCheck from "./_routes/username.check.js";
import profileSetup from "./_routes/profile.setup.js";
import profileUpdate from "./_routes/profile.update.js";
import cloudinarySign from "./_routes/cloudinary.sign.js";

const ROUTES = {
  "me": me,
  "username/check": usernameCheck,
  "profile/setup": profileSetup,
  "profile/update": profileUpdate,
  "cloudinary/sign": cloudinarySign,
};

function getRouteKey(req) {
  // Vercel often provides req.query for dynamic routes; handle both cases safely.
  const q = req.query?.path;
  if (Array.isArray(q)) return q.join("/");
  if (typeof q === "string") return q;

  const url = new URL(req.url, "http://localhost");
  return url.pathname.replace(/^\/api\/?/, "");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const key = getRouteKey(req);
    const route = ROUTES[key];

    if (!route) return sendJson(res, 404, { error: "not_found", route: key });
    return await route(req, res);
  } catch {
    return sendJson(res, 500, { error: "server_error" });
  }
}