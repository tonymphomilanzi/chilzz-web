import { apiFetch } from "@/lib/api";

export async function uploadAvatarToCloudinary(file) {
  const sign = await apiFetch("/api/cloudinary/sign", {
    method: "POST",
    body: JSON.stringify({ kind: "avatar" }),
  });

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sign.apiKey);
  form.append("timestamp", String(sign.timestamp));
  form.append("folder", sign.folder);
  form.append("signature", sign.signature);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
    { method: "POST", body: form }
  );

  const data = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(data?.error?.message || "Cloudinary upload failed");

  return { publicId: data.public_id, url: data.secure_url };
}