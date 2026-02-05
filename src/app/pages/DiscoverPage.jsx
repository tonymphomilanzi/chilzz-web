import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp, onSnapshot, query,where  } from "firebase/firestore";

import { db } from "@/lib/firebaseClient";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useNavigate } from "react-router-dom";

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "CZ";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

function normalizeAt(input) {
  return String(input || "").trim().replace(/^@/, "").toLowerCase();
}

export default function DiscoverPage() {

  const nav = useNavigate();

const [chatByUserId, setChatByUserId] = useState({});      // otherUid -> chatId
const [pendingSentTo, setPendingSentTo] = useState({});    // toUid -> true

  const { user } = useAuth();
  const myUid = user?.uid;

  const [myProfile, setMyProfile] = useState(null);

  // discover feed
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  // search
  const [q, setQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResult, setSearchResult] = useState(null);

  // vibe check modal
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [firstMsg, setFirstMsg] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");

  // load my neon profile (for fromMeta)
  useEffect(() => {
    let alive = true;
    async function loadMe() {
      try {
        const me = await apiFetch("/api/me");
        if (!alive) return;
        setMyProfile(me.profile || null);
      } catch {
        if (!alive) return;
        setMyProfile(null);
      }
    }
    loadMe();
    return () => {
      alive = false;
    };
  }, []);

  // load discover feed
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



  useEffect(() => {
  if (!myUid) return;

  const qChats = query((collection(db, "chats"), where("memberUids", "array-contains", myUid))
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
        if (vc.status === "pending" && vc.toUid) {
          map[vc.toUid] = true;
        }
      });
      setPendingSentTo(map);
    },
    (err) => console.error("discover outgoing vibeChecks error:", err)
  );

  return () => unsub();
}, [myUid]);

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

    if (pendingSentTo[target.user_id]) {
  throw new Error("Vibe already sent.");
}
    if (!myUid) return;

    setSendBusy(true);
    setSendError("");

    try {
      if (!target?.user_id) throw new Error("No user selected.");
      if (target.user_id === myUid) throw new Error("That’s you.");

      const msg = firstMsg.trim();
      if (!msg) throw new Error("Drop a vibe first.");

      const fromMeta = {
        displayName: myProfile?.display_name || user?.displayName || "Someone",
        username: myProfile?.username || null,
        avatarUrl: myProfile?.avatar_url || user?.photoURL || null,
      };

      await addDoc(collection(db, "vibeChecks"), {
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

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      {/* left user info ... unchanged */}

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
              <DialogTitle>Vibe Check 👀</DialogTitle>
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