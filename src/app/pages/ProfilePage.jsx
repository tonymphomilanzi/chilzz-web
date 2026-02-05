import React, { useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";

import { auth } from "@/lib/firebaseClient";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me";
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
import { Switch } from "@/components/ui/switch";

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

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "CZ";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

function normalizeForForm(p) {
  return {
    displayName: p?.display_name || "",
    username: p?.username || "",
    gender: p?.gender || "",
    dob: p?.dob ? String(p.dob).slice(0, 10) : "",
    vibe: p?.vibe || "chillin",
    discoverable: typeof p?.discoverable === "boolean" ? p.discoverable : true,
    avatarUrl: p?.avatar_url || "",
    avatarPublicId: p?.avatar_public_id || null,
  };
}

export default function ProfilePage() {
  const fileRef = useRef(null);

  const { profile, loading, refresh } = useMe();

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(() => normalizeForForm(null));

  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const avatarSrc = useMemo(() => {
    return form.avatarUrl || profile?.avatar_url || "";
  }, [form.avatarUrl, profile?.avatar_url]);

  // When profile loads the first time, initialize form once (and when leaving edit mode we re-init)
  React.useEffect(() => {
    if (!editMode && profile) setForm(normalizeForForm(profile));
  }, [profile, editMode]);

  async function logout() {
    await signOut(auth);
  }

  function startEdit() {
    setSaveError("");
    setSaveOk("");
    setAvatarError("");
    setEditMode(true);
    setForm(normalizeForForm(profile));
  }

  function cancelEdit() {
    setSaveError("");
    setSaveOk("");
    setAvatarError("");
    setEditMode(false);
    setForm(normalizeForForm(profile));
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
          discoverable: form.discoverable,
          avatarUrl: form.avatarUrl || null,
          avatarPublicId: form.avatarPublicId || null,
        }),
      });

      setSaveOk("Saved.");
      setEditMode(false);

      // refresh Neon profile (also updates presence writer inputs)
      await refresh();
    } catch (err) {
      setSaveError(err?.message || "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full p-5">
        <div className="text-sm text-muted-foreground">Loading profile…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-full p-5">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>No profile found. Complete onboarding first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={refresh}>
              Retry
            </Button>
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
          {/* Top row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar className="h-16 w-16 border border-border">
                <AvatarImage src={avatarSrc} />
                <AvatarFallback>{initials(profile.display_name)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <div className="font-semibold truncate">{profile.display_name}</div>
                <div className="text-sm text-muted-foreground truncate">@{profile.username}</div>
              </div>
            </div>

            <div className="flex gap-2">
              {!editMode ? (
                <Button onClick={startEdit}>Edit</Button>
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

          {!editMode ? (
            // VIEW MODE
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Discover</span>
                <span>{profile.discoverable ? "Discoverable" : "Hidden"}</span>
              </div>
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
            // EDIT MODE
            <div className="space-y-4">
              {/* Avatar */}
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

              {/* Discoverable toggle */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Show me in Discover</div>
                  <div className="text-xs text-muted-foreground">
                    If off, you won’t appear in Discover—only @search can find you.
                  </div>
                </div>
                <Switch
                  checked={!!form.discoverable}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, discoverable: !!v }))}
                />
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
                  Username change comes later with a cooldown.
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