import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  db,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "@/lib/firestore";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { usePresenceMap } from "@/lib/usePresenceMap";
import { useSfx } from "@/lib/sfx";

/* -------------------- helpers -------------------- */

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

function formatMsgTime(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate === "function" ? ts.toDate() : null;
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabel(ts) {
  if (!ts || typeof ts.toDate !== "function") return "";
  const d = ts.toDate();
  const today = new Date();

  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  if (sameDay) return "Today";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function isNearBottom(el, threshold = 140) {
  if (!el) return true;
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining < threshold;
}

function TailRight({ fill = "hsl(var(--primary))" }) {
  return (
    <svg
      className="absolute -right-[6px] bottom-[6px]"
      width="12"
      height="18"
      viewBox="0 0 12 18"
      aria-hidden="true"
    >
      <path
        d="M1 0 C 8 6, 10 10, 1 18 L 12 18 L 12 0 Z"
        fill={fill}
      />
    </svg>
  );
}

function TailLeft({ fill = "hsl(var(--card))" }) {
  return (
    <svg
      className="absolute -left-[6px] bottom-[6px]"
      width="12"
      height="18"
      viewBox="0 0 12 18"
      aria-hidden="true"
    >
      <path
        d="M11 0 C 4 6, 2 10, 11 18 L 0 18 L 0 0 Z"
        fill={fill}
      />
    </svg>
  );
}

/* -------------------- component -------------------- */

export default function VibesPage() {
  const { playSend, playReceive } = useSfx();

  const { chatId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const myUid = user?.uid;

  const [myProfile, setMyProfile] = useState(null);

  // chats list
  const [chats, setChats] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  // vibe checks
  const [checksOpen, setChecksOpen] = useState(false);
  const [checks, setChecks] = useState([]);
  const [checksLoading, setChecksLoading] = useState(true);
  const [checksError, setChecksError] = useState("");

  // thread state
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  // auto-scroll state
  const threadRef = useRef(null);
  const bottomRef = useRef(null);
  const [newMsgCount, setNewMsgCount] = useState(0);

  const initialMsgsLoadedRef = useRef(false);
  const lastSeenMsgIdRef = useRef(null);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === chatId) || null,
    [chats, chatId]
  );

  // presence subscriptions (for list + header)
  const otherUids = useMemo(() => {
    if (!myUid) return [];
    return chats.map((c) => otherUid(c.memberUids, myUid)).filter(Boolean);
  }, [chats, myUid]);

  const presenceMap = usePresenceMap(otherUids);

  function scrollToBottom(behavior = "smooth") {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function onThreadScroll() {
    const el = threadRef.current;
    if (isNearBottom(el)) setNewMsgCount(0);
  }

  /* -------- load my Neon profile (for accept meta) -------- */
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

  /* -------- chats list listener -------- */
  useEffect(() => {
    if (!myUid) return;

    setListLoading(true);
    setListError("");

    const qChats = query(collection(db, "chats"), where("memberUids", "array-contains", myUid));

    const unsub = onSnapshot(
      qChats,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // sort locally
        items.sort((a, b) => {
          const as = a.lastMessageAt?.seconds || 0;
          const bs = b.lastMessageAt?.seconds || 0;
          return bs - as;
        });

        setChats(items);
        setListLoading(false);

        // auto-open first chat
        if (!chatId && items.length > 0) {
          nav(`/app/vibes/${items[0].id}`, { replace: true });
        }
      },
      (err) => {
        console.error("chats listener error:", err);
        setListError(err?.message || "Failed to load chats");
        setListLoading(false);
      }
    );

    return () => unsub();
  }, [myUid, nav, chatId]);

  /* -------- vibe checks inbox -------- */
  useEffect(() => {
    if (!myUid) return;

    setChecksLoading(true);
    setChecksError("");

    const qChecks = query(collection(db, "vibeChecks"), where("toUid", "==", myUid));

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
        setChecksError(err?.message || "Failed to load vibe checks");
        setChecksLoading(false);
      }
    );

    return () => unsub();
  }, [myUid]);

  /* -------- messages listener (IMPORTANT: do not depend on playReceive) -------- */
  useEffect(() => {
    initialMsgsLoadedRef.current = false;
    lastSeenMsgIdRef.current = null;
    setNewMsgCount(0);

    if (!myUid || !chatId) {
      setMessages([]);
      setThreadLoading(false);
      return;
    }

    setThreadLoading(true);

    const qMsgs = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));

    const unsub = onSnapshot(
      qMsgs,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const el = threadRef.current;
        const nearBottom = isNearBottom(el);

        setMessages(items);
        setThreadLoading(false);

        // first load -> jump to bottom
        if (!initialMsgsLoadedRef.current) {
          initialMsgsLoadedRef.current = true;
          lastSeenMsgIdRef.current = items.length ? items[items.length - 1].id : null;
          setNewMsgCount(0);
          setTimeout(() => scrollToBottom("auto"), 0);
          return;
        }

        const last = items.length ? items[items.length - 1] : null;
        if (!last) return;

        const prevLastId = lastSeenMsgIdRef.current;
        lastSeenMsgIdRef.current = last.id;

        const isNewLast = last.id !== prevLastId;
        const isFromOther = last.senderUid && last.senderUid !== myUid;

        if (nearBottom) {
          setNewMsgCount(0);
          setTimeout(() => scrollToBottom("smooth"), 0);
        } else if (isNewLast && isFromOther) {
          setNewMsgCount((c) => c + 1);
        }

        if (isNewLast && isFromOther) playReceive();
      },
      (err) => {
        console.error("messages listener error:", err);
        setThreadLoading(false);
      }
    );

    return () => unsub();
  }, [myUid, chatId]); // keep deps minimal

  /* -------- actions -------- */
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

      playSend();

      await updateDoc(doc(db, "chats", chatId), {
        lastMessageAt: serverTimestamp(),
        lastMessageText: t.slice(0, 200),
        lastSenderUid: myUid,
      });

      setText("");
      setTimeout(() => scrollToBottom("smooth"), 0);
    } finally {
      setSendBusy(false);
    }
  }

  async function acceptVibeCheck(check) {
    if (!myUid) return;

    try {
      const fromUid = check.fromUid;
      const toUid = check.toUid;
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

      // import first message
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

  async function declineVibeCheck(check) {
    try {
      await updateDoc(doc(db, "vibeChecks", check.id), { status: "declined" });
    } catch (e) {
      console.error("declineVibeCheck failed:", e);
    }
  }

  /* -------- render helpers -------- */
  function renderChatRow(c) {
    const ouid = otherUid(c.memberUids, myUid);
    const meta = c.memberMeta?.[ouid] || {};
    const p = presenceMap[ouid];

    const title = meta.displayName || (meta.username ? `@${meta.username}` : "Vibe");
    const subtitle = c.lastMessageText || "";
    const active = c.id === chatId;

    return (
      <button
        key={c.id}
        onClick={() => nav(`/app/vibes/${c.id}`)}
        className={[
          "w-full text-left px-3 py-3 rounded-xl border transition flex items-center gap-3",
          active ? "bg-card border-border" : "border-transparent hover:bg-card/60 hover:border-border",
        ].join(" ")}
      >
        <div className="relative">
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={meta.avatarUrl || ""} />
            <AvatarFallback>{initials(meta.displayName)}</AvatarFallback>
          </Avatar>
          <span
            className={[
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
              presenceDot(p),
            ].join(" ")}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium truncate">{title}</div>
            <div className="text-[11px] text-muted-foreground">
              {vibeLabel(p?.vibe)}
            </div>
          </div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
      </button>
    );
  }

  const headerTitle = useMemo(() => {
    if (!activeChat || !myUid) return "Your Vibes";
    const ouid = otherUid(activeChat.memberUids, myUid);
    const meta = activeChat.memberMeta?.[ouid] || {};
    return meta.displayName || (meta.username ? `@${meta.username}` : "Vibes");
  }, [activeChat, myUid]);

  /* -------------------- UI -------------------- */

  return (
    <div className="h-full flex">
      {/* Left list */}
     <section className={`${chatId ? "hidden md:flex" : "flex"} md:flex w-full md:w-[320px] border-r border-border flex-col`}>
        <div className="p-3 flex items-center justify-between gap-2">
          <div className="font-semibold">Your Vibes</div>

          <Button variant="secondary" size="sm" onClick={() => setChecksOpen(true)}>
            Vibe Checks {checks.length ? `(${checks.length})` : ""}
          </Button>
        </div>

        <ScrollArea className="flex-1 px-2 pb-3">
          {listLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading…</div>
          ) : listError ? (
            <div className="p-3 text-sm text-red-300">{listError}</div>
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
      <section className={`${chatId ? "flex" : "hidden md:flex"} flex-1 flex-col`}>
        {/* Header */}
        <div className="h-14 border-b border-border px-4 flex items-center justify-between">
          {activeChat && myUid ? (
            (() => {
              const ouid = otherUid(activeChat.memberUids, myUid);
              const meta = activeChat.memberMeta?.[ouid] || {};
              const p = presenceMap[ouid];

              return (
                <div className="flex items-center gap-3 min-w-0">

                  {chatId ? (
  <button
    type="button"
    onClick={() => nav("/app/vibes")}
    className="md:hidden mr-2 h-9 w-9 rounded-xl border border-border bg-card grid place-items-center"
    title="Back"
  >
    <ArrowLeftIcon className="h-5 w-5" />
  </button>
) : null}
                  <div className="relative">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarImage src={meta.avatarUrl || ""} />
                      <AvatarFallback>{initials(meta.displayName)}</AvatarFallback>
                    </Avatar>
                    <span
                      className={[
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                        presenceDot(p),
                      ].join(" ")}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="font-medium truncate">{meta.displayName || headerTitle}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p?.state === "online" ? "Vibing now" : p?.state === "away" ? "Lowkey" : "Offline"} •{" "}
                      {vibeLabel(p?.vibe)}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="font-medium truncate">{headerTitle}</div>
          )}
        </div>

        {/* Thread */}
        <div
          ref={threadRef}
          onScroll={onThreadScroll}
          className="flex-1 overflow-y-auto p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/30 via-background to-background"
        >
          {!chatId ? (
            <div className="text-sm text-muted-foreground">Pick a vibe.</div>
          ) : threadLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">Drop a vibe.</div>
          ) : (
            <div className="space-y-2">
              {messages.map((m, idx) => {
                const mine = m.senderUid === myUid;

                const ouid = activeChat && myUid ? otherUid(activeChat.memberUids, myUid) : null;
                const otherMeta = ouid ? activeChat?.memberMeta?.[ouid] : null;

                // day separator
                const prev = messages[idx - 1];
                const day = formatDayLabel(m.createdAt);
                const prevDay = prev ? formatDayLabel(prev.createdAt) : null;
                const showDay = day && day !== prevDay;

                return (
                  <React.Fragment key={m.id}>
                    {showDay ? (
                      <div className="py-2 flex justify-center">
                        <div className="text-[11px] px-3 py-1 rounded-full border border-border bg-card text-muted-foreground">
                          {day}
                        </div>
                      </div>
                    ) : null}

                    <div className={mine ? "flex justify-end" : "flex justify-start"}>
                      {!mine ? (
                        <div className="mr-2 mt-1">
                          <Avatar className="h-7 w-7 border border-border">
                            <AvatarImage src={otherMeta?.avatarUrl || ""} />
                            <AvatarFallback>{initials(otherMeta?.displayName)}</AvatarFallback>
                          </Avatar>
                        </div>
                      ) : null}

                     <div
  className={[
    "relative max-w-[72%] rounded-2xl border shadow-sm",
    mine
      ? "bg-primary text-primary-foreground border-transparent rounded-br-md"
      : "bg-card border-border rounded-bl-md",
  ].join(" ")}
>
  {mine ? <TailRight /> : <TailLeft />}

  <div className="relative px-3 py-2 pr-14">
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {m.text}
    </div>

    <div className="absolute bottom-1 right-2 text-[10px] opacity-70">
      {formatMsgTime(m.createdAt)}
    </div>
  </div>
</div>


                    </div>
                  </React.Fragment>
                );
              })}

              <div ref={bottomRef} />
            </div>
          )}

          {/* New message pill */}
          {newMsgCount > 0 ? (
            <div className="sticky bottom-3 w-full flex justify-center pointer-events-none">
              <button
                type="button"
                onClick={() => {
                  setNewMsgCount(0);
                  scrollToBottom("smooth");
                }}
                className="pointer-events-auto text-xs px-3 py-2 rounded-full bg-card border border-border shadow-md hover:bg-card/80 transition"
              >
                {newMsgCount} new vibe{newMsgCount > 1 ? "s" : ""} • Jump down
              </button>
            </div>
          ) : null}
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3 flex gap-2 items-end bg-background/80 backdrop-blur">
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
            <DialogTitle>Vibe Checks (People Intrested To Vibe With You)</DialogTitle>
          </DialogHeader>

          {checksLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : checksError ? (
            <div className="text-sm text-red-300">{checksError}</div>
          ) : checks.length === 0 ? (
            <div className="text-sm text-muted-foreground">No new vibe checks.</div>
          ) : (
            <div className="space-y-2">
              {checks.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3"
                >
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

                      <div className="text-sm text-muted-foreground break-words">{c.message}</div>

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