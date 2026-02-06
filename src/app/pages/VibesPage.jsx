// src/app/pages/VibesPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// Firestore (your wrapper)
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

// Auth + APIs
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

// UI
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Icons
import {
  ArrowLeftIcon,
  PaperAirplaneIcon,
  FaceSmileIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";

// Presence + SFX
import { usePresenceMap } from "@/lib/usePresenceMap";
import { useSfx } from "@/lib/sfx";
import { useMediaQuery } from "@/lib/useMediaQuery";

/* ----------------------------- Chat helpers ----------------------------- */

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

/* --------------------------- Presence helpers --------------------------- */

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

/* ----------------------------- Time helpers ----------------------------- */

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

/* --------------------------- Scroll helpers ----------------------------- */

function isNearBottom(el, threshold = 140) {
  if (!el) return true;
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  return remaining < threshold;
}

/* =============================== Component ============================== */

export default function VibesPage() {
  // SFX
  const { playSend, playReceive } = useSfx();

  // Routing
  const { chatId } = useParams();
  const nav = useNavigate();

  // Auth
  const { user } = useAuth();
  const myUid = user?.uid;

  // Responsive
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Neon profile (for accept meta)
  const [myProfile, setMyProfile] = useState(null);

  // Chats list state
  const [chats, setChats] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  // Vibe Checks state
  const [checksOpen, setChecksOpen] = useState(false);
  const [checks, setChecks] = useState([]);
  const [checksLoading, setChecksLoading] = useState(true);
  const [checksError, setChecksError] = useState("");

  // Thread state
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // Composer state
  const [text, setText] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const composerRef = useRef(null);

  // Auto-scroll state
  const threadRef = useRef(null);
  const bottomRef = useRef(null);
  const [newMsgCount, setNewMsgCount] = useState(0);

  const initialMsgsLoadedRef = useRef(false);
  const lastSeenMsgIdRef = useRef(null);

  // Active chat doc (from list)
  const activeChat = useMemo(
    () => chats.find((c) => c.id === chatId) || null,
    [chats, chatId]
  );

  // Presence subscriptions (list + header)
  const otherUids = useMemo(() => {
    if (!myUid) return [];
    return chats.map((c) => otherUid(c.memberUids, myUid)).filter(Boolean);
  }, [chats, myUid]);

  const presenceMap = usePresenceMap(otherUids);

  /* ---------------------------- UI handlers ---------------------------- */

  function scrollToBottom(behavior = "smooth") {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function onThreadScroll() {
    const el = threadRef.current;
    if (isNearBottom(el)) setNewMsgCount(0);
  }

  function autoresizeComposer() {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 140); // cap height
    el.style.height = `${next}px`;
  }

  function onComposerKeyDown(e) {
    // Enter sends, Shift+Enter new line (WhatsApp feel)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dropVibe();
    }
  }

  /* ------------------------- Effects: Load Me -------------------------- */
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

  /* ---------------------- Effects: Chats list -------------------------- */
  useEffect(() => {
    if (!myUid) return;

    setListLoading(true);
    setListError("");

    const qChats = query(collection(db, "chats"), where("memberUids", "array-contains", myUid));

    const unsub = onSnapshot(
      qChats,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        items.sort((a, b) => {
          const as = a.lastMessageAt?.seconds || 0;
          const bs = b.lastMessageAt?.seconds || 0;
          return bs - as;
        });

        setChats(items);
        setListLoading(false);

        // Desktop split view: auto-open first chat
        // Mobile: do not auto-open (prevents back button "bouncing")
        if (isDesktop && !chatId && items.length > 0) {
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
  }, [myUid, nav, chatId, isDesktop]);

  /* -------------------- Effects: Vibe Checks inbox --------------------- */
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

  /* ---------------------- Effects: Messages thread --------------------- */
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
  }, [myUid, chatId, playReceive]);

  /* --------------------- Effects: Composer resize ---------------------- */
  useEffect(() => {
    autoresizeComposer();
  }, [text]);

  /* --------------------- Actions: Drop a vibe -------------------------- */
  async function dropVibe() {
    if (!myUid || !chatId) return;
    if (sendBusy) return;

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

  /* ------------------ Actions: Accept/Decline check -------------------- */
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

      const otherMeta = check.fromMeta || { displayName: "Someone", username: null, avatarUrl: null };

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

  /* -------------------- Render: Chat list row -------------------------- */
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
            <div className="text-[11px] text-muted-foreground">{vibeLabel(p?.vibe)}</div>
          </div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
      </button>
    );
  }

  /* --------------------- Render: Header title -------------------------- */
  const headerTitle = useMemo(() => {
    if (!activeChat || !myUid) return "Your Vibes";
    const ouid = otherUid(activeChat.memberUids, myUid);
    const meta = activeChat.memberMeta?.[ouid] || {};
    return meta.displayName || (meta.username ? `@${meta.username}` : "Vibes");
  }, [activeChat, myUid]);

  /* =============================== JSX ================================ */

  return (
    <div className="h-full flex min-h-0">
      {/* ------------------ Left list (mobile list-only) ------------------ */}
      <section
        className={`${
          chatId ? "hidden md:flex" : "flex"
        } md:flex w-full md:w-[320px] border-r border-border flex-col min-h-0`}
      >
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

      {/* ---------------- Thread (mobile thread-only) ---------------- */}
      <section className={`${chatId ? "flex" : "hidden md:flex"} flex-1 flex-col min-h-0`}>
        {/* Header */}
        <div className="h-14 border-b border-border px-3 md:px-4 flex items-center gap-2">
          {/* Mobile back */}
          {chatId ? (
            <button
              type="button"
              onClick={() => nav("/app/vibes", { replace: true })}
              className="md:hidden h-9 w-9 rounded-xl border border-border bg-card grid place-items-center shrink-0"
              title="Back"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
          ) : null}

          {activeChat && myUid ? (
            (() => {
              const ouid = otherUid(activeChat.memberUids, myUid);
              const meta = activeChat.memberMeta?.[ouid] || {};
              const p = presenceMap[ouid];

              return (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
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
          className="flex-1 min-h-0 overflow-y-auto p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/30 via-background to-background"
        >
          {!chatId ? (
            <div className="text-sm text-muted-foreground">Pick a vibe.</div>
          ) : threadLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">Say something…</div>
          ) : (
            <div className="space-y-2">
              {messages.map((m, idx) => {
                const mine = m.senderUid === myUid;

                const ouid = activeChat && myUid ? otherUid(activeChat.memberUids, myUid) : null;
                const otherMeta = ouid ? activeChat?.memberMeta?.[ouid] : null;

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

                      {/* Bubble (no tail) */}
                      <div
                        className={[
                          "max-w-[78%] rounded-2xl shadow-sm",
                          mine
                            ? "bg-primary/95 text-primary-foreground rounded-br-md"
                            : "bg-card text-foreground ring-1 ring-border/60 rounded-bl-md",
                        ].join(" ")}
                      >
                        <div className="px-3 py-2">
                          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {m.text}
                          </div>
                          <div className="mt-1 flex justify-end text-[10px] opacity-70">
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

          {/* New messages pill */}
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

        {/* Composer (WhatsApp-ish) */}
        <div className="border-t border-border px-2 py-2 bg-background/80 backdrop-blur">
          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-10 rounded-full"
              title="Emoji (soon)"
              onClick={() => {}}
            >
              <FaceSmileIcon className="h-6 w-6" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="h-10 w-10 rounded-full"
              title="Attach (soon)"
              onClick={() => {}}
            >
              <PaperClipIcon className="h-6 w-6" />
            </Button>

            <div className="flex-1 rounded-2xl border border-border bg-card px-3 py-2">
              <textarea
                ref={composerRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder="Type a vibe…"
                className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed min-h-[24px] max-h-[140px]"
                disabled={!chatId || sendBusy}
              />
            </div>

            <Button
              type="button"
              onClick={dropVibe}
              disabled={!chatId || sendBusy || !text.trim()}
              className="h-10 w-10 rounded-full p-0"
              title="Send"
            >
              <PaperAirplaneIcon className="h-5 w-5 -rotate-45" />
            </Button>
          </div>
        </div>
      </section>

      {/* ------------------------- Vibe Checks dialog ------------------------ */}
      <Dialog open={checksOpen} onOpenChange={setChecksOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vibe Checks (People Intrested To Chill With You)</DialogTitle>
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