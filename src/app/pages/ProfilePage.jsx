import React, { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";

import { apiFetch } from "@/lib/api";
import { auth } from "@/lib/firebaseClient";
import { uploadAvatarToCloudinary } from "@/lib/cloudinaryUpload";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "na", label: "Prefer not to say" },
];

const VIBES = [
  { value: "chillin", label: "Chillin’" },
  { value: "on_fire", label: "On Fire" },
  { value: "ghost", label: "Ghost" },
  { value: "lowkey", label: "Lowkey" },
  { value: "afk", label: "AFK" },
];

function toInitials(name) {
  const s = String(name || "").trim();
  if (!s) return "CZ";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

function normalizeProfileForForm(p) {
  return {
    displayName: p?.display_name || "",
    username: p?.username || "",
    gender: p?.gender || "",
    dob: p?.dob ? String(p.dob).slice(0, 10) : "", // ensure YYYY-MM-DD
    vibe: p?.vibe || "chillin",
    avatarUrl: p?.avatar_url || "",
    avatarPublicId: p?.avatar_public_id || null,
  };
}

export default function ProfilePage() {
  const fileRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [profile, setProfile] = useState(null); // raw from API
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState(() => normalizeProfileForForm(null));
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const avatarSrc = useMemo(() => form.avatarUrl || profile?.avatar_url || "", [form.avatarUrl, profile]);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const me = await apiFetch("/api/me");
      if (!me.onboarded) {
        // If user somehow lands here without onboarding, app gate should redirect;
        // we still guard.
        setLoadError("Profile not set up yet. Go complete onboarding.");
        setProfile(null);
        return;
      }
      setProfile(me.profile);
      setForm(normalizeProfileForForm(me.profile));
    } catch (e) {
      setLoadError(e?.message || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit() {
    setSaveError("");
    setSaveOk("");
    setAvatarError("");
    setEditMode(true);
    setForm(normalizeProfileForForm(profile));
  }

  function cancelEdit() {
    setSaveError("");
    setSaveOk("");
    setAvatarError("");
    setEditMode(false);
    setForm(normalizeProfileForForm(profile));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickAvatar(e) {
    const f = e.target.files?.[0] || null;
    setAvatarError("");
    setSaveOk("");

    if (!f) return;

    if (f.size > 5 * 1024 * 1024) {
      setAvatarError("Max avatar size is 5MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setAvatarUploading(true);
    try {
      const uploaded = await uploadAvatarToCloudinary(f);
      setForm((prev) => ({
        ...prev,
        avatarUrl: uploaded.url,
        avatarPublicId: uploaded.publicId,
      }));
    } catch (err) {
      setAvatarError(err?.message || "Avatar upload failed.");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setAvatarUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setSaveError("");
    setSaveOk("");

    try {
      await apiFetch("/api/profile/update", {
        method: "POST",
        body: JSON.stringify({
          displayName: form.displayName,
          gender: form.gender,
          dob: form.dob,
          vibe: form.vibe,
          avatarUrl: form.avatarUrl || null,
          avatarPublicId: form.avatarPublicId || null,
        }),
      });

      setSaveOk("Saved.");
      setEditMode(false);
      await load(); // refresh from server as source of truth
    } catch (err) {
      setSaveError(err?.message || "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await signOut(auth);
  }

  if (loading) {
    return (
      <div className="h-full p-5">
        <div className="text-sm text-muted-foreground">Loading profile…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full p-5">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription className="text-red-300">{loadError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={load}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full p-5">
      <Card className="max-w-xl">
        <CardHeader className="space-y-1">
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your chilZz identity.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* header row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border border-border">
                <AvatarImage src={avatarSrc} />
                <AvatarFallback>{toInitials(profile?.display_name)}</AvatarFallback>
              </Avatar>

              <div>
                <div className="font-semibold">{profile?.display_name}</div>
                <div className="text-sm text-muted-foreground">@{profile?.username}</div>
              </div>
            </div>

            <div className="flex gap-2">
              {!editMode ? (
                <Button onClick={startEdit}>Edit profile</Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={cancelEdit} disabled={busy || avatarUploading}>
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={busy || avatarUploading}>
                    {busy ? "Saving…" : "Save"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {saveError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {saveError}
            </div>
          ) : null}

          {saveOk ? (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
              {saveOk}
            </div>
          ) : null}

          {/* view mode */}
          {!editMode ? (
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Gender</span>
                <span>{profile.gender}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">DOB</span>
                <span>{String(profile.dob).slice(0, 10)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Vibe</span>
                <span>{profile.vibe}</span>
              </div>

              <div className="pt-2">
                <Button variant="secondary" onClick={logout}>
                  Log out
                </Button>
              </div>
            </div>
          ) : (
            /* edit mode */
            <div className="space-y-4">
              {/* avatar upload */}
              <div className="space-y-2">
                <Label>Avatar</Label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickAvatar}
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? "Uploading…" : "Change avatar"}
                  </Button>

                  {avatarError ? <span className="text-xs text-red-400">{avatarError}</span> : null}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Display name</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Username</Label>
                <Input value={form.username} disabled />
                <p className="text-xs text-muted-foreground">
                  Username change will be added with a cooldown.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Gender</Label>
                  <Select
                    value={form.gender}
                    onValueChange={(v) => setForm((p) => ({ ...p, gender: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Date of birth</Label>
                  <Input
                    type="date"
                    value={form.dob}
                    onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Vibe</Label>
                <Select value={form.vibe} onValueChange={(v) => setForm((p) => ({ ...p, vibe: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vibe" />
                  </SelectTrigger>
                  <SelectContent>
                    {VIBES.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2">
                <Button variant="secondary" onClick={logout} disabled={busy || avatarUploading}>
                  Log out
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}