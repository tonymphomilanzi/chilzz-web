import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebaseClient";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function dmChatId(uidA, uidB) {
  const [a, b] = [uidA, uidB].sort();
  return `dm_${a}_${b}`;
}

function otherUid(memberUids, myUid) {
  return (memberUids || []).find((u) => u !== myUid) || myUid;
}

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "CZ";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

export default function VibesPage() {
  const { chatId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const myUid = user?.uid;

  const [myProfile, setMyProfile] = useState(null);

  // chats (accepted)
  const [chats, setChats] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // vibe checks inbox
  const [checksOpen, setChecksOpen] = useState(false);
  const [checks, setChecks] = useState([]);
  const [checksLoading, setChecksLoading] = useState(true);

  // thread
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === chatId) || null,
    [chats, chatId]
  );

  // load my profile (for memberMeta when accepting)
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
    return () => (alive = false);
  }, []);

// accepted chats list (NO orderBy -> avoids index + missing-field issues)
async function acceptVibeCheck(check) {
  if (!myUid) return;

  try {
    const fromUid = check.fromUid;
    const toUid = check.toUid; // me
    const firstMessage = String(check.message || "").trim();

    const id = dmChatId(fromUid, toUid);
    const chatRef = doc(db, "chats", id);
    const checkRef = doc(db, "vibeChecks", check.id);

    const myMeta = {
      displayName: myProfile?.display_name || user?.displayName || "Me",
      username: myProfile?.username || null,
      avatarUrl: myProfile?.avatar_url || user?.photoURL || null,
    };

    const otherMeta = check.fromMeta || { displayName: "Someone", username: null, avatarUrl: null };

    // ensure chat exists + set summary now
    await setDoc(
      chatRef,
      {
        type: "dm",
        memberUids: [fromUid, toUid],
        memberMeta: { [fromUid]: otherMeta, [toUid]: myMeta },
        lastMessageAt: serverTimestamp(),
        lastMessageText: firstMessage ? firstMessage.slice(0, 200) : "",
        lastSenderUid: fromUid,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    // import first message (special rules allow this)
    if (firstMessage) {
      await setDoc(doc(db, "chats", id, "messages", check.id), {
        senderUid: fromUid,
        type: "text",
        text: firstMessage,
        viaVibeCheckId: check.id,
        createdAt: serverTimestamp(),
      });
    }

    await updateDoc(checkRef, { status: "accepted" });

    setChecksOpen(false);
    nav(`/app/vibes/${id}`);
  } catch (e) {
    console.error("acceptVibeCheck failed:", e);
  }
}

  // vibe checks inbox
// vibe checks inbox (query only by toUid; filter pending locally -> no index)
useEffect(() => {
  if (!myUid) return;

  setChecksLoading(true);

  const qChecks = query(
    collection(db, "vibeChecks"),
    where("toUid", "==", myUid)
  );

  const unsub = onSnapshot(
    qChecks,
    (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const pending = all
        .filter((c) => c.status === "pending")
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      setChecks(pending);
      setChecksLoading(false);
    },
    (err) => {
      console.error("vibeChecks listener error:", err);
      setChecksLoading(false);
    }
  );

  return () => unsub();
}, [myUid]);
    

  // messages in active chat
  useEffect(() => {
    if (!myUid || !chatId) {
      setMessages([]);
      return;
    }

    setThreadLoading(true);
    const qMsgs = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));

    const unsub = onSnapshot(
      qMsgs,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setThreadLoading(false);
      },
      () => setThreadLoading(false)
    );

    return () => unsub();
  }, [myUid, chatId]);

  async function dropVibe() {
    if (!myUid || !chatId) return;
    const t = text.trim();
    if (!t) return;

    setSendBusy(true);
    try {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        senderUid: myUid,
        type: "text",
        text: t,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "chats", chatId), {
        lastMessageAt: serverTimestamp(),
        lastMessageText: t.slice(0, 200),
        lastSenderUid: myUid,
      });

      setText("");
    } finally {
      setSendBusy(false);
    }
  }

 async function acceptVibeCheck(check) {
  if (!myUid) return;

  try {
    const fromUid = check.fromUid;
    const toUid = check.toUid; // should be me
    const firstMessage = String(check.message || "").trim();

    const id = dmChatId(fromUid, toUid);
    const chatRef = doc(db, "chats", id);
    const checkRef = doc(db, "vibeChecks", check.id);

    const myMeta = {
      displayName: myProfile?.display_name || user?.displayName || "Me",
      username: myProfile?.username || null,
      avatarUrl: myProfile?.avatar_url || user?.photoURL || null,
    };

    const otherMeta = check.fromMeta || {
      displayName: "Someone",
      username: null,
      avatarUrl: null,
    };

    // 1) Ensure chat exists (create/merge). No need to read it first.
    await setDoc(
      chatRef,
      {
        type: "dm",
        memberUids: [fromUid, toUid],
        memberMeta: {
          [fromUid]: otherMeta,
          [toUid]: myMeta,
        },
      },
      { merge: true }
    );

    // 2) Import the first message into chat as sender = fromUid
    // IMPORTANT: message doc id == vibeCheck doc id, and includes viaVibeCheckId
    if (firstMessage) {
      await setDoc(doc(db, "chats", id, "messages", check.id), {
        senderUid: fromUid,
        type: "text",
        text: firstMessage,
        viaVibeCheckId: check.id,
        createdAt: serverTimestamp(),
      });
    }

    // 3) Update chat "last message" summary
    await updateDoc(chatRef, {
      lastMessageAt: serverTimestamp(),
      lastMessageText: firstMessage.slice(0, 200),
      lastSenderUid: fromUid,
    });

    // 4) Mark request accepted (this is what removes it from the inbox)
    await updateDoc(checkRef, { status: "accepted" });

    setChecksOpen(false);
    nav(`/app/vibes/${id}`);
  } catch (e) {
    console.error("acceptVibeCheck failed:", e);
    // optional: show UI error state
  }
}
async function declineVibeCheck(check) {
  try {
    await updateDoc(doc(db, "vibeChecks", check.id), { status: "declined" });
  } catch (e) {
    console.error("declineVibeCheck failed:", e);
  }
}
  function renderChatRow(c) {
    const ouid = otherUid(c.memberUids, myUid);
    const meta = c.memberMeta?.[ouid] || {};
    const title = meta.displayName || (meta.username ? `@${meta.username}` : "Vibe");
    const subtitle = c.lastMessageText || "";

    const active = c.id === chatId;

    return (
      <button
        key={c.id}
        onClick={() => nav(`/app/vibes/${c.id}`)}
        className={[
          "w-full text-left px-3 py-3 rounded-xl border transition",
          active ? "bg-card border-border" : "border-transparent hover:bg-card/60 hover:border-border",
        ].join(" ")}
      >
        <div className="font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </button>
    );
  }

  const headerTitle = useMemo(() => {
    if (!activeChat || !myUid) return "Your Vibes";
    const ouid = otherUid(activeChat.memberUids, myUid);
    const meta = activeChat.memberMeta?.[ouid] || {};
    return meta.displayName || (meta.username ? `@${meta.username}` : "Vibes");
  }, [activeChat, myUid]);

  return (
    <div className="h-full flex">
      {/* Left list */}
      <section className="w-[320px] border-r border-border flex flex-col">
        <div className="p-3 flex items-center justify-between gap-2">
          <div className="font-semibold">Your Vibes</div>

          <Button variant="secondary" size="sm" onClick={() => setChecksOpen(true)}>
            Vibe Checks {checks.length ? `(${checks.length})` : ""}
          </Button>
        </div>

        <ScrollArea className="flex-1 px-2 pb-3">
          {listLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading…</div>
          ) : chats.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              No vibes yet. Go Discover and send a Vibe Check.
            </div>
          ) : (
            <div className="space-y-1">{chats.map(renderChatRow)}</div>
          )}
        </ScrollArea>
      </section>

      {/* Center thread */}
      <section className="flex-1 flex flex-col">
        <div className="h-14 border-b border-border px-4 flex items-center justify-between">
          <div className="font-medium truncate">{headerTitle}</div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {!chatId ? (
            <div className="text-sm text-muted-foreground">Pick a vibe.</div>
          ) : threadLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">Drop a vibe.</div>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => {
                const mine = m.senderUid === myUid;
                return (
                  <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={[
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm border",
                        mine
                          ? "bg-primary text-primary-foreground border-transparent"
                          : "bg-card border-border",
                      ].join(" ")}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* composer */}
        <div className="border-t border-border p-3 flex gap-2 items-end">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Drop a vibe…"
            className="min-h-[44px] max-h-[160px]"
            disabled={!chatId || sendBusy}
          />
          <Button onClick={dropVibe} disabled={!chatId || sendBusy || !text.trim()}>
            Drop a vibe
          </Button>
        </div>
      </section>

      {/* Vibe Checks dialog */}
      <Dialog open={checksOpen} onOpenChange={setChecksOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vibe Checks 👀</DialogTitle>
          </DialogHeader>

          {checksLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : checks.length === 0 ? (
            <div className="text-sm text-muted-foreground">No new vibe checks.</div>
          ) : (
            <div className="space-y-2">
              {checks.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarImage src={c.fromMeta?.avatarUrl || ""} />
                      <AvatarFallback>{initials(c.fromMeta?.displayName)}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {c.fromMeta?.displayName || "Someone"}{" "}
                        {c.fromMeta?.username ? (
                          <span className="text-muted-foreground text-sm">@{c.fromMeta.username}</span>
                        ) : null}
                      </div>
                      <div className="text-sm text-muted-foreground break-words">
                        {c.message}
                      </div>

                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => acceptVibeCheck(c)}>
                          Let’s Chill 
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => declineVibeCheck(c)}>
  Not my vibe 
</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}