/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "@/lib/api";
import { normalizeUsername, useUsernameAvailability } from "@/app/hooks/useUsernameAvailability";
import { uploadAvatarToCloudinary } from "@/lib/cloudinaryUpload";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const STEPS = [
  { key: "basics", title: "Basics", desc: "Tell us about you." },
  { key: "username", title: "Username", desc: "Claim your @name." },
  { key: "avatar", title: "Avatar", desc: "Pick a face for your vibe." },
  { key: "vibe", title: "Vibe", desc: "How you showing up?" },
  { key: "review", title: "Finish", desc: "Lock it in." },
];

const VIBES = [
  { id: "chillin", label: "Chillin’", hint: "Online, relaxed." },
  { id: "on_fire", label: "On Fire", hint: "Active, replying fast." },
  { id: "ghost", label: "Ghost", hint: "Don’t disturb." },
  { id: "lowkey", label: "Lowkey", hint: "Here, but quiet." },
  { id: "afk", label: "AFK", hint: "Away." },
];

function getAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function StepsBar({ total, index }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={[
            "h-1.5 flex-1 rounded-full transition",
            i <= index ? "bg-primary" : "bg-muted",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

function tryParseApiError(err) {
  // apiFetch throws Error(text). text might be JSON: {"error":"username_taken"}
  try {
    return JSON.parse(err?.message || "{}");
  } catch {
    return null;
  }
}

export default function OnboardingPage() {
  const nav = useNavigate();

  const [step, setStep] = useState(0);

  // form state
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState(""); // male/female/other/na
  const [dob, setDob] = useState("");

  const [username, setUsername] = useState("");
  const usernameCheck = useUsernameAvailability(username);

  const [vibe, setVibe] = useState("chillin");

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const fileRef = useRef(null);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const currentStep = STEPS[step];
  const progressValue = Math.round(((step + 1) / STEPS.length) * 100);

  //
  const [avatarUploading, setAvatarUploading] = useState(false);
const [avatarCloud, setAvatarCloud] = useState(null); // { publicId, url }
const [avatarError, setAvatarError] = useState("");

  // Avatar preview
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const age = useMemo(() => getAge(dob), [dob]);
  const dobValid = Boolean(dob) && age !== null && age >= 13;

  const basicsOk = displayName.trim().length >= 2 && Boolean(gender) && dobValid;
  const usernameOk = usernameCheck.isValid;
  const vibeOk = Boolean(vibe);

  const canGoNext =
    (currentStep.key === "basics" && basicsOk) ||
    (currentStep.key === "username" && usernameOk) ||
    currentStep.key === "avatar" ||
    (currentStep.key === "vibe" && vibeOk) ||
    currentStep.key === "review";

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function finish() {
    setSubmitBusy(true);
    setSubmitError("");


    try {
      await apiFetch("/api/profile.setup", {
        method: "POST",
        body: JSON.stringify({
          displayName: displayName.trim(),
          username,
          gender,
          dob,
          vibe,
          avatarPublicId: avatarCloud?.publicId || null,
          avatarUrl: avatarCloud?.url || null,
        }),
      });

      nav("/app/pings", { replace: true });
    } catch (err) {
      const parsed = tryParseApiError(err);

      // Common case: someone else claimed username between check and submit
      if (parsed?.error === "username_taken") {
        setStep(STEPS.findIndex((s) => s.key === "username"));
        setSubmitError("That username just got taken. Pick another one.");
        return;
      }

      setSubmitError(parsed?.error || err?.message || "Could not finish onboarding.");
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <StepsBar total={STEPS.length} index={step} />
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{currentStep.title}</CardTitle>
              <CardDescription>{currentStep.desc}</CardDescription>
            </div>
            <div className="w-28">
              <Progress value={progressValue} />
              <div className="mt-1 text-xs text-muted-foreground text-right">
                {progressValue}%
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {submitError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {submitError}
            </div>
          ) : null}

          {/* STEP: BASICS */}
          {currentStep.key === "basics" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Display name</Label>
                <Input
                  placeholder="e.g. Jay Chill"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">This shows in rooms and chats.</p>
              </div>

              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="na">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Date of birth</Label>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                {!dob ? null : age === null ? (
                  <p className="text-xs text-red-400">Invalid date.</p>
                ) : age < 13 ? (
                  <p className="text-xs text-red-400">You must be 13+ to use chilZz.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Age: {age}</p>
                )}
              </div>
            </div>
          )}

          {/* STEP: USERNAME */}
          {currentStep.key === "username" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Username</Label>
                <Input
                  placeholder="e.g. chill_master"
                  value={username}
                  onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                />

                <div className="flex items-center justify-between">
                  <p
                    className={[
                      "text-xs",
                      usernameCheck.status === "available"
                        ? "text-green-400"
                        : usernameCheck.status === "checking"
                        ? "text-muted-foreground"
                        : usernameCheck.status === "idle"
                        ? "text-muted-foreground"
                        : "text-red-400",
                    ].join(" ")}
                  >
                    {usernameCheck.message}
                  </p>
                  <p className="text-xs text-muted-foreground">lowercase only</p>
                </div>
              </div>

              {usernameCheck.status === "taken" && usernameCheck.suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {usernameCheck.suggestions.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setUsername(s)}
                    >
                      @{s}
                    </Button>
                  ))}
                </div>
              ) : null}

              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm text-muted-foreground">
                  This becomes your identity:{" "}
                  <span className="text-foreground">@{username || "username"}</span>
                </p>
              </div>
            </div>
          )}

          {/* STEP: AVATAR */}
          {currentStep.key === "avatar" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border border-border">
                  <AvatarImage src={avatarCloud?.url || avatarPreview} />
                  <AvatarFallback>
                    {(displayName || "cz").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {avatarUploading ? (
  <p className="text-xs text-muted-foreground">Uploading...</p>
) : null}

{avatarError ? (
  <p className="text-xs text-red-400">{avatarError}</p>
) : null}

                <div className="space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                   onChange={async (e) => {
  const f = e.target.files?.[0] || null;
  setAvatarError("");
  setAvatarFile(f);

  if (!f) {
    setAvatarCloud(null);
    return;
  }

  // basic guard
  if (f.size > 5 * 1024 * 1024) {
    setAvatarError("Max file size is 5MB.");
    setAvatarFile(null);
    if (fileRef.current) fileRef.current.value = "";
    return;
  }

  setAvatarUploading(true);
  try {
    const uploaded = await uploadAvatarToCloudinary(f);
    setAvatarCloud(uploaded);
  } catch (err) {
    setAvatarError(err?.message || "Upload failed.");
    setAvatarCloud(null);
  } finally {
    setAvatarUploading(false);
  }
}}
                  />

                  <div className="flex gap-2">
                    <Button type="button" onClick={() => fileRef.current?.click()}>
                      Choose photo
                    </Button>

                    {avatarFile ? (
                      <Button
                        type="button"
                        variant="secondary"
                       onClick={() => {
  setAvatarFile(null);
  setAvatarCloud(null);
  setAvatarError("");
  if (fileRef.current) fileRef.current.value = "";
}}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Next step: we’ll upload this to Cloudinary and store it in Neon.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP: VIBE */}
          {currentStep.key === "vibe" && (
            <div className="space-y-3">
              <RadioGroup value={vibe} onValueChange={setVibe} className="space-y-2">
                {VIBES.map((v) => (
                  <Label
                    key={v.id}
                    htmlFor={v.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem id={v.id} value={v.id} />
                      <div>
                        <div className="font-medium">{v.label}</div>
                        <div className="text-xs text-muted-foreground">{v.hint}</div>
                      </div>
                    </div>

                    <div
                      className={[
                        "h-2.5 w-2.5 rounded-full",
                        v.id === "on_fire"
                          ? "bg-primary"
                          : v.id === "ghost"
                          ? "bg-zinc-500"
                          : "bg-zinc-300",
                      ].join(" ")}
                    />
                  </Label>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* STEP: REVIEW */}
          {currentStep.key === "review" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Name:</span> {displayName || "—"}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Username:</span> @{username || "—"}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Gender:</span> {gender || "—"}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">DOB:</span> {dob || "—"}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Vibe:</span> {vibe}
                </div>
              </div>
            </div>
          )}

          {/* NAV */}
          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="secondary" onClick={back} disabled={step === 0 || submitBusy}>
              Back
            </Button>

            {currentStep.key === "review" ? (
              <Button type="button" onClick={finish} disabled={submitBusy}>
                {submitBusy ? "Finishing..." : "Finish"}
              </Button>
            ) : (
              <Button type="button" onClick={next} disabled={!canGoNext || submitBusy}>
                Next
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}