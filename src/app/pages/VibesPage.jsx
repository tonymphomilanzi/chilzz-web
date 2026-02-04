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

  // accepted chats list
  useEffect(() => {
    if (!myUid) return;

    setListLoading(true);
    const qChats = query(
      collection(db, "chats"),
      where("memberUids", "array-contains", myUid),
      orderBy("lastMessageAt", "desc")
    );

    const unsub = onSnapshot(
      qChats,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setChats(items);
        setListLoading(false);

        if (!chatId && items.length > 0) {
          nav(`/app/vibes/${items[0].id}`, { replace: true });
        }
      },
      () => setListLoading(false)
    );

    return () => unsub();
  }, [myUid, nav, chatId]);

  // vibe checks inbox
  useEffect(() => {
    if (!myUid) return;

    setChecksLoading(true);
    const qChecks = query(
      collection(db, "vibeChecks"),
      where("toUid", "==", myUid),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qChecks,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setChecks(items);
        setChecksLoading(false);
      },
      () => setChecksLoading(false)
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

    const fromUid = check.fromUid;
    const toUid = check.toUid;
    const firstMessage = String(check.message || "").trim();

    const id = dmChatId(fromUid, toUid);
    const chatRef = doc(db, "chats", id);
    const checkRef = doc(db, "vibeChecks", check.id);

    // Meta snapshots
    const myMeta = {
      displayName: myProfile?.display_name || user?.displayName || "Me",
      username: myProfile?.username || null,
      avatarUrl: myProfile?.avatar_url || user?.photoURL || null,
    };

    const otherMeta = check.fromMeta || { displayName: "Someone", username: null, avatarUrl: null };

    // If chat exists already, don’t duplicate; just mark accepted + open it
    const existing = await getDoc(chatRef);

    // Create chat doc if needed
    if (!existing.exists()) {
      await setDoc(chatRef, {
        type: "dm",
        memberUids: [fromUid, toUid],
        memberMeta: {
          [fromUid]: otherMeta,
          [toUid]: myMeta,
        },
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessageText: firstMessage || "",
        lastSenderUid: fromUid,
      });
    }

    // Drop the first vibe into messages if we created chat and have a message
    // (even if chat existed, we assume the first message may already be there; keep MVP simple)
    if (firstMessage) {
      await addDoc(collection(db, "chats", id, "messages"), {
        senderUid: fromUid,
        type: "text",
        text: firstMessage,
        createdAt: serverTimestamp(),
      });
    }

    // Update check status (receiver is allowed to do this by rules)
    await updateDoc(checkRef, { status: "accepted" });

    setChecksOpen(false);
    nav(`/app/vibes/${id}`);
  }

  async function declineVibeCheck(check) {
    const checkRef = doc(db, "vibeChecks", check.id);
    await updateDoc(checkRef, { status: "declined" });
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