import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { useMe } from "@/lib/me";
import { apiFetch } from "@/lib/api";

import { usePresenceMap } from "@/lib/usePresenceMap";
import { db, collection, onSnapshot, query, serverTimestamp, setDoc, doc, where } from "@/lib/firestore";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "CZ";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

function normalizeAt(input) {
  return String(input || "").trim().replace(/^@/, "").toLowerCase();
}

function presenceDot(p) {
  const state = p?.state || "offline";
  if (state === "online") return "bg-green-500";
  if (state === "away") return "bg-yellow-500";
  return "bg-zinc-500";
}

function vibeLabel(v) {
  const map = {
    chillin: "Chillin’",
    on_fire: "On Fire",
    ghost: "Ghost",
    lowkey: "Lowkey",
    afk: "AFK",
  };
  return map[v] || "Chillin’";
}

// deterministic id: one pending request per pair
function vibeCheckId(fromUid, toUid) {
  return `vc_${fromUid}_${toUid}`;
}

export default function DiscoverPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const myUid = user?.uid;

  const { profile: myProfile } = useMe();

  // discover feed (Neon)
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  // search (Neon)
  const [q, setQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResult, setSearchResult] = useState(null);

  // For button state:
  // - chatByUserId: if DM exists -> "Drop a vibe"
  // - pendingSentTo: if pending request exists -> "Vibe sent"
  const [chatByUserId, setChatByUserId] = useState({});
  const [pendingSentTo, setPendingSentTo] = useState({});

  // vibe check modal
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [firstMsg, setFirstMsg] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");

  // Load discover feed
  useEffect(() => {
    let alive = true;

    async function loadFeed() {
      setFeedLoading(true);
      setFeedError("");
      try {
        const res = await apiFetch("/api/discover/users");
        if (!alive) return;
        setFeed(Array.isArray(res.users) ? res.users : []);
      } catch (e) {
        if (!alive) return;
        setFeedError(e?.message || "Failed to load Discover.");
      } finally {
        if (alive) setFeedLoading(false);
      }
    }

    loadFeed();
    return () => {
      alive = false;
    };
  }, []);

  // Listen to my existing chats to know if I already "chill" with someone
  useEffect(() => {
    if (!myUid) return;

    const qChats = query(
      collection(db, "chats"),
      where("memberUids", "array-contains", myUid)
    );

    const unsub = onSnapshot(
      qChats,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const memberUids = data.memberUids || [];
          const other = memberUids.find((x) => x !== myUid);
          if (other) map[other] = d.id;
        });
        setChatByUserId(map);
      },
      (err) => console.error("discover chats map error:", err)
    );

    return () => unsub();
  }, [myUid]);

  // Listen to outgoing vibe checks (pending)
  useEffect(() => {
    if (!myUid) return;

    const qOut = query(
      collection(db, "vibeChecks"),
      where("fromUid", "==", myUid)
    );

    const unsub = onSnapshot(
      qOut,
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          const vc = d.data();
          if (vc.status === "pending" && vc.toUid) map[vc.toUid] = true;
        });
        setPendingSentTo(map);
      },
      (err) => console.error("discover outgoing vibeChecks error:", err)
    );

    return () => unsub();
  }, [myUid]);

  // Presence for users on screen (cap to keep listeners small)
  const presenceUids = useMemo(() => {
    const ids = [];
    if (searchResult?.user_id) ids.push(searchResult.user_id);
    for (const u of feed) ids.push(u.user_id);
    return Array.from(new Set(ids)).slice(0, 25);
  }, [feed, searchResult]);

  const presenceMap = usePresenceMap(presenceUids);

  const canSend = useMemo(() => {
    return Boolean(target?.user_id) && firstMsg.trim().length >= 1 && !sendBusy;
  }, [target, firstMsg, sendBusy]);

  async function runSearch() {
    setSearchBusy(true);
    setSearchError("");
    setSearchResult(null);

    try {
      const u = normalizeAt(q);
      if (!u) throw new Error("Type a username.");
      const res = await apiFetch(`/api/user/by-username?u=${encodeURIComponent(u)}`);
      setSearchResult(res.user);
    } catch (e) {
      setSearchError(e?.message || "Not found.");
    } finally {
      setSearchBusy(false);
    }
  }

  function openVibeCheck(u) {
    setTarget(u);
    setFirstMsg("");
    setSendError("");
    setOpen(true);
  }

  async function sendVibeCheck() {
    if (!myUid) return;

    try {
      setSendBusy(true);
      setSendError("");

      if (!target?.user_id) throw new Error("No user selected.");
      if (target.user_id === myUid) throw new Error("That’s you.");

      if (chatByUserId[target.user_id]) {
        throw new Error("You’re already chilling. Drop a vibe in the chat.");
      }

      if (pendingSentTo[target.user_id]) {
        throw new Error("Vibe already sent.");
      }

      const msg = firstMsg.trim();
      if (!msg) throw new Error("Drop a vibe first.");

      const fromMeta = {
        displayName: myProfile?.display_name || user?.displayName || "Someone",
        username: myProfile?.username || null,
        avatarUrl: myProfile?.avatar_url || user?.photoURL || null,
      };

      // Deterministic doc id prevents spamming multiple pending requests
      const id = vibeCheckId(myUid, target.user_id);

      await setDoc(doc(db, "vibeChecks", id), {
        fromUid: myUid,
        toUid: target.user_id,
        status: "pending",
        message: msg,
        createdAt: serverTimestamp(),
        fromMeta,
      });

      setOpen(false);
      setTarget(null);
      setFirstMsg("");
    } catch (e) {
      setSendError(e?.message || "Could not send Vibe Check.");
    } finally {
      setSendBusy(false);
    }
  }

  function UserRow({ u }) {
    const existingChatId = chatByUserId[u.user_id];
    const alreadySent = !!pendingSentTo[u.user_id];
    const p = presenceMap[u.user_id];

    const shownVibe = p?.vibe || u.vibe;
    const shownState = p?.state || "offline";

    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        {/* LEFT: avatar + names + presence */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <Avatar className="h-10 w-10 border border-border">
              <AvatarImage src={u.avatar_url || ""} />
              <AvatarFallback>{initials(u.display_name)}</AvatarFallback>
            </Avatar>
            <span
              className={[
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                presenceDot(p),
              ].join(" ")}
              title={shownState}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-medium truncate">{u.display_name || "Unknown"}</div>
              <div className="text-[11px] text-muted-foreground">{vibeLabel(shownVibe)}</div>
            </div>
            <div className="text-xs text-muted-foreground truncate">@{u.username || "—"}</div>
          </div>
        </div>

        {/* RIGHT: action */}
        {existingChatId ? (
          <Button onClick={() => nav(`/app/vibes/${existingChatId}`)}>
            Drop a vibe
          </Button>
        ) : alreadySent ? (
          <Button variant="secondary" disabled>
            Vibe sent
          </Button>
        ) : (
          <Button onClick={() => openVibeCheck(u)}>
            Vibe Check
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full p-5">
      <div className="max-w-3xl space-y-5">
        {/* Search */}
        <Card>
          <CardHeader>
            <CardTitle>Discover</CardTitle>
            <CardDescription>Find people to vibe with.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search @username"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
              />
              <Button onClick={runSearch} disabled={searchBusy}>
                {searchBusy ? "Searching..." : "Search"}
              </Button>
            </div>

            {searchError ? <div className="text-sm text-red-300">{searchError}</div> : null}

            {searchResult ? (
              <div className="pt-2">
                <UserRow u={searchResult} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Feed */}
        <Card>
          <CardHeader>
            <CardTitle>Trending Vibes</CardTitle>
            <CardDescription>People who are discoverable right now.</CardDescription>
          </CardHeader>
          <CardContent>
            {feedError ? <div className="text-sm text-red-300">{feedError}</div> : null}

            {feedLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : feed.length === 0 ? (
              <div className="text-sm text-muted-foreground">No one here yet.</div>
            ) : (
              <ScrollArea className="h-[420px] pr-2">
                <div className="space-y-2">
                  {feed.map((u) => (
                    <UserRow key={u.user_id} u={u} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Vibe Check dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vibe Check</DialogTitle>
            </DialogHeader>

            {target ? (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  To: <span className="text-foreground font-medium">@{target.username}</span>
                </div>

                <Textarea
                  placeholder="Drop a vibe… (first message)"
                  value={firstMsg}
                  onChange={(e) => setFirstMsg(e.target.value)}
                />

                {sendError ? <div className="text-sm text-red-300">{sendError}</div> : null}

                <Button onClick={sendVibeCheck} disabled={!canSend}>
                  {sendBusy ? "Sending..." : "Send Vibe Check"}
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}