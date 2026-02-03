/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

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

import { apiFetch } from "@/lib/api";

const USERNAME_RE = /^[a-z0-9_]{5,25}$/;

function normalizeUsername(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 25);
}

function calcAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;
  const diff = Date.now() - dob.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
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

export default function OnboardingPage() {
  const nav = useNavigate();

  // If already onboarded, bounce to app
  useEffect(() => {
    if (localStorage.getItem("chilzz.onboarded") === "1") {
      nav("/app/pings", { replace: true });
    }
  }, [nav]);

  const steps = useMemo(
    () => [
      { key: "basics", title: "Basics", desc: "Tell us about you." },
      { key: "username", title: "Username", desc: "Claim your @name." },
      { key: "avatar", title: "Avatar", desc: "Pick a face for your vibe." },
      { key: "vibe", title: "Vibe", desc: "How you showing up?" },
      { key: "review", title: "Finish", desc: "Lock it in." },
    ],
    []
  );

  const [step, setStep] = useState(0);

  // form state
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState(""); // male/female/other/na
  const [dob, setDob] = useState("");

  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState("idle"); // idle|checking|available|taken|invalid|error
  const [usernameMsg, setUsernameMsg] = useState("");

  const [vibe, setVibe] = useState("chillin");

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const fileRef = useRef(null);

  // Avatar preview
  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  // Username availability (stub for now; we’ll wire Neon in Milestone 1)
  useEffect(() => {
    const u = username;
    if (!u) {
      setUsernameStatus("idle");
      setUsernameMsg("");
      return;
    }
    if (!USERNAME_RE.test(u)) {
      setUsernameStatus("invalid");
      setUsernameMsg("Use 5–25 chars: letters, numbers, underscore.");
      return;
    }

    let cancelled = false;
    setUsernameStatus("checking");
    setUsernameMsg("Checking availability...");

   const t = setTimeout(async () => {
  try {
    const data = await apiFetch(`/api/username-check?u=${encodeURIComponent(u)}`);
    if (cancelled) return;

    if (data.available) {
      setUsernameStatus("available");
      setUsernameMsg("Available.");
    } else if (data.reason === "taken") {
      setUsernameStatus("taken");
      setUsernameMsg("Taken. Try a suggestion.");
      // (optional) store data.suggestions in state to show chips
    } else {
      setUsernameStatus("invalid");
      setUsernameMsg("Use 5–25 chars: letters, numbers, underscore.");
    }
  } catch {
    if (cancelled) return;
    setUsernameStatus("error");
    setUsernameMsg("Could not check right now.");
  }
}, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username]);

  const progressValue = Math.round(((step + 1) / steps.length) * 100);

  const age = calcAge(dob);
  const dobValid = !!dob && age !== null && age >= 13;

  const basicsOk =
    displayName.trim().length >= 2 &&
    !!gender &&
    dobValid;

  const usernameOk = usernameStatus === "available";

  const vibeOk = !!vibe;

  function next() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  const canGoNext =
    (steps[step].key === "basics" && basicsOk) ||
    (steps[step].key === "username" && usernameOk) ||
    (steps[step].key === "avatar") ||
    (steps[step].key === "vibe" && vibeOk) ||
    (steps[step].key === "review");

  async function finish() {
    // Foundation phase: store locally.
    // async function finish() {
  await apiFetch("/api/profile-setup", {
    method: "POST",
    body: JSON.stringify({
      displayName,
      username,
      gender,
      dob,
      vibe,
    }),
  });

  nav("/app/pings", { replace: true });
}

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <StepsBar total={steps.length} index={step} />
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{steps[step].title}</CardTitle>
              <CardDescription>{steps[step].desc}</CardDescription>
            </div>
            <div className="w-28">
              <Progress value={progressValue} />
              <div className="mt-1 text-xs text-muted-foreground text-right">{progressValue}%</div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* STEP: BASICS */}
          {steps[step].key === "basics" && (
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
          {steps[step].key === "username" && (
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
                      usernameStatus === "available"
                        ? "text-green-400"
                        : usernameStatus === "checking"
                        ? "text-muted-foreground"
                        : "text-red-400",
                    ].join(" ")}
                  >
                    {usernameMsg}
                  </p>
                  <p className="text-xs text-muted-foreground">lowercase only</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm text-muted-foreground">
                  This becomes your identity: <span className="text-foreground">@{username || "username"}</span>
                </p>
              </div>
            </div>
          )}

          {/* STEP: AVATAR */}
          {steps[step].key === "avatar" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border border-border">
                  <AvatarImage src={avatarPreview} />
                  <AvatarFallback>{(displayName || "cz").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>

                <div className="space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setAvatarFile(f);
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
                          setAvatarPreview("");
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    We’ll upload this to Cloudinary when we wire the backend.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP: VIBE */}
          {steps[step].key === "vibe" && (
            <div className="space-y-3">
              <RadioGroup value={vibe} onValueChange={setVibe} className="space-y-2">
                {[
                  { id: "chillin", label: "Chillin’", hint: "Online, relaxed." },
                  { id: "on_fire", label: "On Fire", hint: "Active, replying fast." },
                  { id: "ghost", label: "Ghost", hint: "Don’t disturb." },
                  { id: "lowkey", label: "Lowkey", hint: "Here, but quiet." },
                  { id: "afk", label: "AFK", hint: "Away." },
                ].map((v) => (
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
          {steps[step].key === "review" && (
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

              <p className="text-xs text-muted-foreground">
                Next milestone: we’ll save this to Neon + claim username for real.
              </p>
            </div>
          )}

          {/* NAV */}
          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="secondary" onClick={back} disabled={step === 0}>
              Back
            </Button>

            {steps[step].key === "review" ? (
              <Button type="button" onClick={finish}>
                Finish
              </Button>
            ) : (
              <Button type="button" onClick={next} disabled={!canGoNext}>
                Next
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}