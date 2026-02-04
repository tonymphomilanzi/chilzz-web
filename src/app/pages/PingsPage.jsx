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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

function dmChatId(uidA, uidB) {
  const [a, b] = [uidA, uidB].sort();
  return `dm_${a}_${b}`;
}

function otherUid(memberUids, myUid) {
  return memberUids.find((u) => u !== myUid) || myUid;
}

export default function PingsPage() {
  const { chatId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const myUid = user?.uid;

  const [chats, setChats] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // new ping dialog
  const [open, setOpen] = useState(false);
  const [toUsername, setToUsername] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  // thread
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const activeChat = useMemo(() => chats.find((c) => c.id === chatId) || null, [chats, chatId]);

  // Chat list realtime
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

        // If no chat selected but we have chats, open first
        if (!chatId && items.length > 0) {
          nav(`/app/pings/${items[0].id}`, { replace: true });
        }
      },
      () => setListLoading(false)
    );

    return () => unsub();
  }, [myUid, nav, chatId]);

  // Messages realtime for selected chat
  useEffect(() => {
    if (!myUid || !chatId) {
      setMessages([]);
      return;
    }

    setThreadLoading(true);

    const qMsgs = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

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

  async function createOrOpenDm() {
    setCreateBusy(true);
    setCreateError("");

    try {
      const u = toUsername.trim().replace(/^@/, "").toLowerCase();
      if (!u) throw new Error("Enter a username.");

      // Resolve username -> uid via Neon
      const res = await apiFetch(`/api/user/by-username?u=${encodeURIComponent(u)}`);
      const other = res.user;

      if (!other?.user_id) throw new Error("User not found.");

      if (other.user_id === myUid) throw new Error("That’s you.");

      const id = dmChatId(myUid, other.user_id);
      const chatRef = doc(db, "chats", id);

      const existing = await getDoc(chatRef);

      if (!existing.exists()) {
        // We need our own meta snapshot too; easiest for MVP: use Firebase displayName/email fallback
        const myMeta = {
          displayName: user.displayName || "Me",
          username: null, // later we can fetch from /api/me once and cache it
          avatarUrl: user.photoURL || null,
        };

        const otherMeta = {
          displayName: other.display_name,
          username: other.username,
          avatarUrl: other.avatar_url || null,
        };

        await setDoc(chatRef, {
          type: "dm",
          memberUids: [myUid, other.user_id],
          memberMeta: {
            [myUid]: myMeta,
            [other.user_id]: otherMeta,
          },
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
          lastMessageText: "",
          lastSenderUid: null,
        });
      }

      setOpen(false);
      setToUsername("");
      nav(`/app/pings/${id}`);
    } catch (e) {
      setCreateError(e?.message || "Could not start chat.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function send() {
    if (!myUid || !chatId) return;

    const t = text.trim();
    if (!t) return;

    setSendBusy(true);
    try {
      const chatRef = doc(db, "chats", chatId);
      const msgRef = collection(db, "chats", chatId, "messages");

      await addDoc(msgRef, {
        senderUid: myUid,
        type: "text",
        text: t,
        createdAt: serverTimestamp(),
      });

      await updateDoc(chatRef, {
        lastMessageAt: serverTimestamp(),
        lastMessageText: t.slice(0, 200),
        lastSenderUid: myUid,
      });

      setText("");
    } finally {
      setSendBusy(false);
    }
  }

  function renderChatRow(c) {
    const ouid = otherUid(c.memberUids || [], myUid);
    const meta = c.memberMeta?.[ouid] || {};
    const title = meta.displayName || meta.username || "Unknown";
    const subtitle = c.lastMessageText || "";

    const active = c.id === chatId;

    return (
      <button
        key={c.id}
        onClick={() => nav(`/app/pings/${c.id}`)}
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
    if (!activeChat || !myUid) return "Pings";
    const ouid = otherUid(activeChat.memberUids || [], myUid);
    const meta = activeChat.memberMeta?.[ouid] || {};
    return meta.displayName || (meta.username ? `@${meta.username}` : "Ping");
  }, [activeChat, myUid]);

  return (
    <div className="h-full flex">
      {/* Left list */}
      <section className="w-[320px] border-r border-border flex flex-col">
        <div className="p-3 flex items-center justify-between gap-2">
          <div className="font-semibold">Pings</div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start a Ping</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">Username</label>
                  <Input
                    placeholder="@teejay"
                    value={toUsername}
                    onChange={(e) => setToUsername(e.target.value)}
                  />
                </div>

                {createError ? (
                  <div className="text-sm text-red-300">{createError}</div>
                ) : null}

                <Button onClick={createOrOpenDm} disabled={createBusy}>
                  {createBusy ? "Starting..." : "Start"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="flex-1 px-2 pb-3">
          {listLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading chats…</div>
          ) : chats.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No pings yet. Start one.</div>
          ) : (
            <div className="space-y-1">{chats.map(renderChatRow)}</div>
          )}
        </ScrollArea>
      </section>

      {/* Center thread */}
      <section className="flex-1 flex flex-col">
        <div className="h-14 border-b border-border px-4 flex items-center">
          <div className="font-medium truncate">{headerTitle}</div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {!chatId ? (
            <div className="text-sm text-muted-foreground">Pick a chat.</div>
          ) : threadLoading ? (
            <div className="text-sm text-muted-foreground">Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">Say hi. Drop a ping.</div>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => {
                const mine = m.senderUid === myUid;
                return (
                  <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={[
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm border",
                        mine ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border",
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
            placeholder="Send a ping..."
            className="min-h-[44px] max-h-[160px]"
            disabled={!chatId || sendBusy}
          />
          <Button onClick={send} disabled={!chatId || sendBusy || !text.trim()}>
            Send
          </Button>
        </div>
      </section>
    </div>
  );
}