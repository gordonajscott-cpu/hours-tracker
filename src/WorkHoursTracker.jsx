import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./lib/AuthContext";
import { getStorage, loadAllData, saveAllData, loadTasks, saveTasks, createBackup, listBackups, getBackup, deleteBackup, pruneBackups, BackupsTableMissingError, ensureDefaultProfile, createProfile, renameProfile, deleteProfile, ProfilesTableMissingError, createOrg, joinOrg, getMyOrg, getOrgMembers, updateMemberRole, removeMember, regenerateInviteCode, loadOrgConfig, saveOrgConfig, linkProfileToOrg, unlinkProfileFromOrg, leaveOrg, createPortfolio, listOrgPortfolios, deletePortfolio, renamePortfolio, addPortfolioMember, removePortfolioMember, getPortfolioMembers, updatePortfolioMemberRole, getMyPortfolios, loadPortfolioEntries, loadPortfolioTasks } from "./lib/storage";
import { supabase, supabaseConfigured } from "./lib/supabase";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const SHORT_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const STANDARD_WEEKLY_HOURS = 37.5;

const CONFIG_KEY = "wht-v3-config";
const DATA_KEY = "wht-v3-data";
const SETTINGS_KEY = "wht-v3-settings";
const TIMER_KEY = "wht-v3-timer";
const TASKS_KEY = "wht-v3-tasks";

const BLOCK_COLORS = ["#1a73e8","#34a853","#ea4335","#fbbc04","#4285f4","#137333","#c5221f","#f29900","#a142f4","#24c1e0"];

// Auto-detect URLs and make clickable
function LinkText({ text, style }) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s<]+)/g);
  return <span style={style}>{parts.map((part, i) => /^https?:\/\//.test(part) ?
    <a key={i} href={part} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      style={{ color: "#1a73e8", textDecoration: "underline", wordBreak: "break-all" }}>{part.length > 60 ? part.substring(0, 57) + "..." : part}</a>
    : part
  )}</span>;
}

function taskAge(task) {
  if (!task.createdDate) return 0;
  const created = new Date(task.createdDate + "T00:00:00");
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.floor((now - created) / 86400000);
}

// UK Bank Holidays 2025-2027
const BANK_HOLIDAYS = {
  england: {
    label: "England & Wales",
    dates: {
      "2025-01-01": "New Year's Day", "2025-04-18": "Good Friday", "2025-04-21": "Easter Monday",
      "2025-05-05": "Early May Bank Holiday", "2025-05-26": "Spring Bank Holiday", "2025-08-25": "Summer Bank Holiday",
      "2025-12-25": "Christmas Day", "2025-12-26": "Boxing Day",
      "2026-01-01": "New Year's Day", "2026-04-03": "Good Friday", "2026-04-06": "Easter Monday",
      "2026-05-04": "Early May Bank Holiday", "2026-05-25": "Spring Bank Holiday", "2026-08-31": "Summer Bank Holiday",
      "2026-12-25": "Christmas Day", "2026-12-28": "Boxing Day (substitute)",
      "2027-01-01": "New Year's Day", "2027-03-26": "Good Friday", "2027-03-29": "Easter Monday",
      "2027-05-03": "Early May Bank Holiday", "2027-05-31": "Spring Bank Holiday", "2027-08-30": "Summer Bank Holiday",
      "2027-12-27": "Christmas Day (substitute)", "2027-12-28": "Boxing Day (substitute)"
    }
  },
  scotland: {
    label: "Scotland",
    dates: {
      "2025-01-01": "New Year's Day", "2025-01-02": "2nd January", "2025-04-18": "Good Friday",
      "2025-05-05": "Early May Bank Holiday", "2025-05-26": "Spring Bank Holiday",
      "2025-08-04": "Summer Bank Holiday", "2025-11-30": "St Andrew's Day",
      "2025-12-25": "Christmas Day", "2025-12-26": "Boxing Day",
      "2026-01-01": "New Year's Day", "2026-01-02": "2nd January", "2026-04-03": "Good Friday",
      "2026-05-04": "Early May Bank Holiday", "2026-05-25": "Spring Bank Holiday",
      "2026-08-03": "Summer Bank Holiday", "2026-11-30": "St Andrew's Day",
      "2026-12-25": "Christmas Day", "2026-12-28": "Boxing Day (substitute)",
      "2027-01-01": "New Year's Day", "2027-01-04": "2nd January (substitute)", "2027-03-26": "Good Friday",
      "2027-05-03": "Early May Bank Holiday", "2027-05-31": "Spring Bank Holiday",
      "2027-08-02": "Summer Bank Holiday", "2027-11-30": "St Andrew's Day",
      "2027-12-27": "Christmas Day (substitute)", "2027-12-28": "Boxing Day (substitute)"
    }
  },
  northernireland: {
    label: "Northern Ireland",
    dates: {
      "2025-01-01": "New Year's Day", "2025-03-17": "St Patrick's Day", "2025-04-18": "Good Friday",
      "2025-04-21": "Easter Monday", "2025-05-05": "Early May Bank Holiday", "2025-05-26": "Spring Bank Holiday",
      "2025-07-14": "Battle of the Boyne (substitute)", "2025-08-25": "Summer Bank Holiday",
      "2025-12-25": "Christmas Day", "2025-12-26": "Boxing Day",
      "2026-01-01": "New Year's Day", "2026-03-17": "St Patrick's Day", "2026-04-03": "Good Friday",
      "2026-04-06": "Easter Monday", "2026-05-04": "Early May Bank Holiday", "2026-05-25": "Spring Bank Holiday",
      "2026-07-13": "Battle of the Boyne (substitute)", "2026-08-31": "Summer Bank Holiday",
      "2026-12-25": "Christmas Day", "2026-12-28": "Boxing Day (substitute)"
    }
  }
};

function dateStr(d) { return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,"0")}-${d.getDate().toString().padStart(2,"0")}`; }

const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(`${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`);
  }
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function getMondayOfWeek(wn, yr) {
  const j = new Date(yr, 0, 1);
  const dw = j.getDay() || 7;
  const fm = new Date(yr, 0, 1 + (8 - dw) % 7);
  const m = new Date(fm);
  m.setDate(m.getDate() + (wn - getWeekNumber(fm)) * 7);
  return m;
}

function formatDate(d) { return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}`; }
function formatDateLong(d) { return `${DAYS[(d.getDay()+6)%7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function parseTime(s) { if(!s)return null; const[h,m]=s.split(":").map(Number); return h+m/60; }
function timeToStr(t) { const h=Math.floor(t); const m=Math.round((t-h)*60); return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`; }
function fmtH(h) { if(h===null||h===undefined||isNaN(h))return "—"; return `${h<0?"-":""}${Math.abs(h).toFixed(2)}`; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ═══ DAILY QUOTES ═══
const DAILY_QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Your work is going to fill a large part of your life. The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "It is not enough to be busy. The question is: what are we busy about?", author: "Henry David Thoreau" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Productivity is never an accident. It is always the result of a commitment to excellence.", author: "Paul J. Meyer" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Either you run the day, or the day runs you.", author: "Jim Rohn" },
  { text: "The key is not to prioritise what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "Amateurs sit and wait for inspiration. The rest of us just get up and go to work.", author: "Stephen King" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "You don't have to see the whole staircase, just take the first step.", author: "Martin Luther King Jr." },
  { text: "What gets measured gets managed.", author: "Peter Drucker" },
  { text: "Time is what we want most, but what we use worst.", author: "William Penn" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "Efficiency is doing things right; effectiveness is doing the right things.", author: "Peter Drucker" },
  { text: "Plans are nothing; planning is everything.", author: "Dwight D. Eisenhower" },
  { text: "The mind is everything. What you think you become.", author: "Buddha" },
  { text: "Well begun is half done.", author: "Aristotle" },
  { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { text: "Clarity precedes mastery.", author: "Robin Sharma" },
  { text: "Progress, not perfection.", author: "Unknown" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
  { text: "If you spend too much time thinking about a thing, you'll never get it done.", author: "Bruce Lee" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson" },
];

// ═══ CALENDAR ═══
const CAL_START = 0, CAL_END = 24, HOUR_H = 72;
const CAL_H = (CAL_END - CAL_START) * HOUR_H;
const CAL_VIEW_HOURS = 11;
const CAL_VIEW_H = CAL_VIEW_HOURS * HOUR_H;
function getDefaultScroll() {
  const n = new Date();
  const now = n.getHours() + n.getMinutes() / 60;
  const defaultStart = 8.5; // 08:30
  const defaultEnd = defaultStart + CAL_VIEW_HOURS; // 19:30
  if (now >= defaultStart && now <= defaultEnd) return defaultStart;
  if (now < defaultStart) {
    // Early morning — show from 30 min before current time
    return Math.max(0, now - 0.5);
  }
  // Late evening — show current time near bottom with 1.5h buffer below
  return Math.min(CAL_END - CAL_VIEW_HOURS, now - CAL_VIEW_HOURS + 1.5);
}
function snap(t) { return Math.round(t * 4) / 4; }

function DayCalendar({ entries, selected, onSelect, onUpdateEntry, onMoveEntry, onAddEntry, onDelete, workStart, workEnd, liveTimer, showNowLine }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [nowTime, setNowTime] = useState(() => { const n = new Date(); return n.getHours() + n.getMinutes() / 60; });

  // Update now line every 30 seconds
  useEffect(() => {
    if (!showNowLine) return;
    const iv = setInterval(() => { const n = new Date(); setNowTime(n.getHours() + n.getMinutes() / 60); }, 30000);
    return () => clearInterval(iv);
  }, [showNowLine]);

  function tY(t) { return (t - CAL_START) * HOUR_H; }
  function yT(y) { return snap(y / HOUR_H + CAL_START); }
  function mY(e) { if(!ref.current)return 0; return e.clientY - ref.current.getBoundingClientRect().top; }

  // Get sorted other entries (excluding one by id)
  function getOthers(excludeId) {
    return entries
      .filter(e => e.id !== excludeId)
      .map(e => ({ s: parseTime(e.start), e: parseTime(e.end) }))
      .filter(e => e.s !== null && e.e !== null)
      .sort((a, b) => a.s - b.s);
  }

  // Find the gap boundaries around a time point, given sorted others
  function findBounds(others, t) {
    let lower = CAL_START;
    let upper = CAL_END;
    for (const o of others) {
      if (o.e <= t) lower = Math.max(lower, o.e);
      if (o.s >= t && o.s < upper) upper = o.s;
    }
    return { lower, upper };
  }

  // Find gap boundaries for a block (start to end)
  function findBlockBounds(others, s, e) {
    let lower = CAL_START;
    let upper = CAL_END;
    for (const o of others) {
      if (o.e <= s) lower = Math.max(lower, o.e);
      if (o.s >= e && o.s < upper) upper = o.s;
      // If another block overlaps with our range, tighten bounds
      if (o.s < e && o.e > s) {
        if (o.s <= s) lower = Math.max(lower, o.e);
        else upper = Math.min(upper, o.s);
      }
    }
    return { lower, upper };
  }

  // Check if a range overlaps any others
  function hasOverlap(others, s, e) {
    return others.some(o => s < o.e && e > o.s);
  }

  // Delete key handler
  useEffect(() => {
    function handleKey(e) {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && onDelete) {
        const el = document.activeElement;
        const tag = el?.tagName?.toLowerCase();
        // Allow delete if not in an input, or if in an empty input/textarea
        if (tag === "input" || tag === "textarea" || tag === "select") {
          if (el.value && el.value.length > 0) return;
        }
        e.preventDefault();
        onDelete(selected);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selected, onDelete]);

  useEffect(() => {
    if (!dragging) return;
    function mv(e) {
      const t = yT(mY(e));
      const ent = entries.find(x => x.id === dragging.id);
      if (!ent) return;
      const others = getOthers(dragging.id);
      const curStart = parseTime(ent.start);
      const curEnd = parseTime(ent.end);

      if (dragging.type === "start") {
        // Find lower bound: can't go earlier than the end of the previous block
        const { lower } = findBounds(others, curStart);
        const ns = Math.max(lower, Math.min(t, curEnd - 0.25));
        onUpdateEntry(dragging.id, "start", timeToStr(ns));
      } else if (dragging.type === "end") {
        // Find upper bound: can't go later than the start of the next block
        const { upper } = findBounds(others, curEnd);
        const ne = Math.min(upper, Math.max(t, curStart + 0.25));
        onUpdateEntry(dragging.id, "end", timeToStr(ne));
      } else if (dragging.type === "move") {
        const dur = curEnd - curStart;
        let ns = snap(yT(mY(e)) - dragging.offset);
        // Clamp within calendar
        ns = Math.max(CAL_START, Math.min(ns, CAL_END - dur));
        // Clamp to not overlap others
        for (const o of others) {
          const ne = ns + dur;
          if (ns < o.e && ne > o.s) {
            // Overlapping - snap to closest side
            const snapBefore = o.s - dur;
            const snapAfter = o.e;
            if (Math.abs(ns - snapBefore) <= Math.abs(ns - snapAfter)) {
              ns = snapBefore;
            } else {
              ns = snapAfter;
            }
          }
        }
        ns = Math.max(CAL_START, Math.min(ns, CAL_END - dur));
        // Final overlap check - if still overlapping, don't move
        if (!hasOverlap(others, ns, ns + dur)) {
          if (onMoveEntry) {
            onMoveEntry(dragging.id, timeToStr(ns), timeToStr(ns + dur));
          } else {
            onUpdateEntry(dragging.id, "start", timeToStr(ns));
            onUpdateEntry(dragging.id, "end", timeToStr(ns + dur));
          }
        }
      }
    }
    function up() { setDragging(null); }
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
  }, [dragging, entries, onUpdateEntry]);

  // Creating new entry by click or drag
  const [creating, setCreating] = useState(null); // { startTime, currentTime }
  const [hoverTime, setHoverTime] = useState(null); // snapped time under cursor

  function handleBgMouseDown(e) {
    if (dragging) return;
    // Only handle left mouse button on background
    if (e.button !== 0) return;
    const t = yT(mY(e));
    // Don't create if clicking on an existing entry's time range
    const allEntries = entries.map(en => ({ s: parseTime(en.start), e: parseTime(en.end) })).filter(en => en.s !== null && en.e !== null);
    if (allEntries.some(en => t >= en.s && t < en.e)) return;
    const others = getOthers(null);
    const { lower, upper } = findBounds(others, t);
    if (upper - lower < 0.25) return;
    const snapped = Math.max(lower, Math.min(snap(t), upper));
    setCreating({ startTime: snapped, currentTime: snapped, lower, upper });
  }

  useEffect(() => {
    if (!creating) return;
    function mv(e) {
      const t = yT(mY(e));
      const clamped = Math.max(creating.lower, Math.min(snap(t), creating.upper));
      setCreating(prev => prev ? { ...prev, currentTime: clamped } : null);
    }
    function up() {
      if (creating) {
        const s = Math.min(creating.startTime, creating.currentTime);
        let en = Math.max(creating.startTime, creating.currentTime);
        // If no drag (or very small), default to 15 minutes
        if (en - s < 0.25) {
          en = Math.min(creating.upper, s + 0.25);
          if (en - s < 0.25) { setCreating(null); return; }
        }
        const others = getOthers(null);
        if (!hasOverlap(others, s, en)) {
          onAddEntry(timeToStr(s), timeToStr(en));
        }
      }
      setCreating(null);
    }
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
  }, [creating, entries, onAddEntry]);

  // Compute preview block for creation drag
  const createPreview = creating ? (() => {
    const s = Math.min(creating.startTime, creating.currentTime);
    const en = Math.max(creating.startTime, creating.currentTime);
    const finalEnd = en - s < 0.25 ? Math.min(creating.upper, s + 0.25) : en;
    return { s, en: finalEnd };
  })() : null;

  const hours = [];
  for (let h = CAL_START; h <= CAL_END; h++) hours.push(h);

  return (
    <div ref={ref} onMouseDown={handleBgMouseDown} tabIndex={0}
      onMouseMove={e => { if (!dragging && !creating) setHoverTime(yT(mY(e))); }}
      onMouseLeave={() => setHoverTime(null)}
      style={{
      position: "relative", width: "100%", height: CAL_H,
      background: "#ffffff", borderRadius: 10, overflow: "hidden",
      cursor: dragging ? "grabbing" : creating ? "ns-resize" : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23202124' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'/%3E%3Cpath d='m15 5 4 4'/%3E%3C/svg%3E") 2 18, auto`, userSelect: "none", border: "1px solid #dadce0",
      outline: "none"
    }}>
      {/* Hour lines */}
      {hours.map(h => (
        <div key={`h${h}`} style={{ position: "absolute", top: tY(h), left: 0, right: 0, display: "flex", alignItems: "center", zIndex: 1 }}>
          <div style={{ width: 52, textAlign: "right", paddingRight: 10, fontSize: 11, color: "#80868b" }}>{h.toString().padStart(2,"0")}:00</div>
          <div style={{ flex: 1, height: 1, background: "#e0e0e0" }} />
        </div>
      ))}
      {/* Half-hour lines */}
      {hours.filter(h => h < CAL_END).map(h => (
        <div key={`h30-${h}`} style={{ position: "absolute", top: tY(h + 0.5), left: 56, right: 0, height: 1, background: "#f0f0f0", zIndex: 1 }} />
      ))}

      {/* Hover time indicator */}
      {hoverTime !== null && !creating && !dragging && (
        <div style={{ position: "absolute", top: tY(hoverTime), left: 0, right: 0, zIndex: 6, pointerEvents: "none", transform: "translateY(-50%)" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              background: "#1a73e8", color: "#ffffff", fontSize: 11, fontWeight: 700,
              padding: "2px 8px", borderRadius: 4, fontFamily: "'Inter', 'Roboto', sans-serif",
              minWidth: 42, textAlign: "center"
            }}>{timeToStr(hoverTime)}</div>
            <div style={{ flex: 1, height: 1, background: "#1a73e8", opacity: 0.35 }} />
          </div>
        </div>
      )}

      {/* Work day shading and boundary lines */}
      {workStart != null && workEnd != null && (() => {
        const ws = parseTime(workStart), we = parseTime(workEnd);
        if (ws === null || we === null) return null;
        return (
          <>
            {/* Shaded work period background */}
            <div style={{
              position: "absolute", left: 56, right: 0, top: tY(ws), height: tY(we) - tY(ws),
              background: "#e8f0fe20", zIndex: 0, borderLeft: "3px solid #1a73e820"
            }} />
            {/* Start line */}
            <div style={{ position: "absolute", top: tY(ws), left: 56, right: 0, zIndex: 5, display: "flex", alignItems: "center", pointerEvents: "none" }}>
              <div style={{ flex: 1, height: 2, background: "#1a73e8", opacity: 0.5, borderRadius: 1 }} />
            </div>
            {/* Start label */}
            <div style={{
              position: "absolute", right: 8, top: tY(ws) - 18,
              fontSize: 10, color: "#1a73e8", fontWeight: 700, opacity: 0.8, zIndex: 6,
              background: "#ffffff", padding: "1px 6px", borderRadius: 4, border: "1px solid #d2e3fc",
              pointerEvents: "none", lineHeight: "14px"
            }}>{workStart}</div>
            {/* End line */}
            <div style={{ position: "absolute", top: tY(we), left: 56, right: 0, zIndex: 5, display: "flex", alignItems: "center", pointerEvents: "none" }}>
              <div style={{ flex: 1, height: 2, background: "#1a73e8", opacity: 0.5, borderRadius: 1 }} />
            </div>
            {/* End label */}
            <div style={{
              position: "absolute", right: 8, top: tY(we) + 4,
              fontSize: 10, color: "#1a73e8", fontWeight: 700, opacity: 0.8, zIndex: 6,
              background: "#ffffff", padding: "1px 6px", borderRadius: 4, border: "1px solid #d2e3fc",
              pointerEvents: "none", lineHeight: "14px"
            }}>{workEnd}</div>
          </>
        );
      })()}

      {/* Creation preview */}
      {createPreview && (
        <div style={{
          position: "absolute", left: 60, right: 12, top: tY(createPreview.s), height: Math.max(tY(createPreview.en) - tY(createPreview.s), 6),
          background: "#1a73e815", borderLeft: "3px solid #1a73e8", borderRadius: "0 6px 6px 0",
          zIndex: 3, pointerEvents: "none", outline: "2px dashed #1a73e860", outlineOffset: -1
        }}>
          <div style={{ position: "absolute", top: 2, left: 8, fontSize: 11, fontWeight: 600, color: "#1a73e8" }}>
            {timeToStr(createPreview.s)} — {timeToStr(createPreview.en)}
          </div>
        </div>
      )}

      {entries.map((ent, idx) => {
        const s = parseTime(ent.start), en = parseTime(ent.end);
        if (s === null || en === null) return null;
        const col = BLOCK_COLORS[idx % BLOCK_COLORS.length];
        const isSel = selected === ent.id;
        const blockHeight = tY(en) - tY(s);
        const minClickH = 24;
        const visualTop = tY(s);
        const clickPad = blockHeight < minClickH ? Math.ceil((minClickH - blockHeight) / 2) : 0;
        return (
          <div key={ent.id} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect(ent.id); }} style={{
            position: "absolute", left: 60, right: 12, top: visualTop - clickPad, height: blockHeight + clickPad * 2,
            zIndex: isSel ? 4 : 2, cursor: "pointer"
          }}>
            <div style={{
              position: "absolute", left: 0, right: 0, top: clickPad, height: blockHeight,
              background: isSel ? `${col}30` : `${col}18`, borderLeft: `3px solid ${col}`,
              borderRadius: "0 6px 6px 0",
              outline: isSel ? `2px solid ${col}` : "none", outlineOffset: 1,
              transition: "outline 0.15s"
            }}>
            {/* Start handle */}
            {blockHeight >= 30 && (
              <div onMouseDown={e => { e.stopPropagation(); setDragging({ id: ent.id, type: "start" }); }} style={{
                position: "absolute", top: 0, left: -3, right: 0, height: 14, cursor: "ns-resize", zIndex: 10
              }}>
                <div style={{ background: col, color: "#ffffff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: "0 3px 3px 0", fontFamily: "'Inter', 'Roboto', sans-serif", display: "inline-block" }}>
                  {ent.start}
                </div>
              </div>
            )}
            {/* End handle */}
            {blockHeight >= 30 && (
              <div onMouseDown={e => { e.stopPropagation(); setDragging({ id: ent.id, type: "end" }); }} style={{
                position: "absolute", bottom: 0, left: -3, right: 0, height: 14, cursor: "ns-resize", zIndex: 10
              }}>
                <div style={{ background: col, color: "#ffffff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: "3px 0 0 3px", fontFamily: "'Inter', 'Roboto', sans-serif", display: "inline-block", position: "absolute", bottom: 0 }}>
                  {ent.end}
                </div>
              </div>
            )}
            {/* Small block: thin edge resize + move in middle */}
            {blockHeight < 30 && isSel && (
              <>
                <div onMouseDown={e => { e.stopPropagation(); setDragging({ id: ent.id, type: "start" }); }}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, cursor: "ns-resize", zIndex: 10 }} />
                <div onMouseDown={e => { e.stopPropagation(); setDragging({ id: ent.id, type: "end" }); }}
                  style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 6, cursor: "ns-resize", zIndex: 10 }} />
                {/* Floating time labels */}
                <div style={{ position: "absolute", top: -18, left: -3, zIndex: 11, pointerEvents: "none" }}>
                  <div style={{ background: col, color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, fontFamily: "'Inter', 'Roboto', sans-serif", display: "inline-block" }}>{ent.start}</div>
                </div>
                <div style={{ position: "absolute", bottom: -18, left: -3, zIndex: 11, pointerEvents: "none" }}>
                  <div style={{ background: col, color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, fontFamily: "'Inter', 'Roboto', sans-serif", display: "inline-block" }}>{ent.end}</div>
                </div>
              </>
            )}
            {/* Delete button - visible on selected block */}
            {isSel && onDelete && (
              <div
                onClick={e => { e.stopPropagation(); onDelete(ent.id); }}
                title="Delete"
                style={{
                  position: "absolute", top: "50%", right: 6, transform: "translateY(-50%)",
                  width: 24, height: 24, borderRadius: 12,
                  background: "#d93025", color: "#ffffff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", zIndex: 12,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  transition: "transform 0.15s"
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.15)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
              ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
            )}
            {/* Move body */}
            <div onMouseDown={e => { e.stopPropagation(); const off = yT(mY(e)) - s; setDragging({ id: ent.id, type: "move", offset: off }); onSelect(ent.id); }}
              style={{ position: "absolute", top: blockHeight >= 30 ? 14 : 0, bottom: blockHeight >= 30 ? 14 : 0, left: 0, right: 0, cursor: "grab", zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{
                fontSize: isSel ? 14 : (blockHeight < 30 ? 10 : 12), fontWeight: 700, color: "#202124",
                fontFamily: "'Inter', 'Roboto', sans-serif", textAlign: "center", pointerEvents: "none",
                overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                padding: "1px 6px", borderRadius: 4,
                background: "rgba(255,255,255,0.85)"
              }}>
                {ent.recurring ? "🔄 " : ""}{ent.note || fmtH(en - s) + "h"}
              </div>
            </div>
            </div>
          </div>
        );
      })}

      {/* Live timer block */}
      {liveTimer && (() => {
        const s = parseTime(liveTimer.start), en = liveTimer.end;
        if (s === null || en === null) return null;
        const top = tY(s), height = Math.max(tY(en) - tY(s), 8);
        return (
          <div style={{
            position: "absolute", left: 60, right: 12, top, height,
            borderLeft: "3px solid #1a73e8",
            borderRadius: "0 6px 6px 0", zIndex: 1,
            outline: "2px dashed #1a73e8", outlineOffset: -1,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none", overflow: "hidden"
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "#1a73e8",
              animation: "timer-breathe 3s ease-in-out infinite"
            }} />
            <div style={{
              fontSize: 11, fontWeight: 700, color: "#1a73e8",
              fontFamily: "'Inter', 'Roboto', sans-serif", textAlign: "center",
              background: "rgba(255,255,255,0.9)", padding: "1px 8px", borderRadius: 4,
              position: "relative", zIndex: 2
            }}>
              ⏱ {liveTimer.note || "Timer running"}
            </div>
          </div>
        );
      })()}

      {/* Current time line */}
      {showNowLine && nowTime >= CAL_START && nowTime <= CAL_END && (
        <div style={{ position: "absolute", top: tY(nowTime), left: 0, right: 0, zIndex: 8, pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#d93025", flexShrink: 0, marginLeft: 46 }} />
            <div style={{ flex: 1, height: 2, background: "#d93025" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ DROPDOWN ═══
function Sel({ value, onChange, options, placeholder, large }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select value={value || ""} onChange={e => onChange(e.target.value)} style={{
        background: "#ffffff", border: "1px solid #dadce0", color: value ? "#202124" : "#5f6368",
        padding: large ? "14px 16px" : "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif",
        fontSize: large ? 20 : 15, width: "100%", outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none"
      }}>
        <option value="">{placeholder || "— Select —"}</option>
        {(options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#5f6368", fontSize: 14 }}>▾</div>
    </div>
  );
}

function TimeSel({ value, onChange, large }) {
  return <Sel value={value} onChange={onChange} options={TIME_OPTIONS} placeholder="— Time —" large={large} />;
}

// Check if a config item is marked favourite
function isFav(item) { return typeof item === "object" && item.favourite === true; }

// Searchable dropdown that shows favourites first with a star. Behaves like a
// native <select> (click to open, pick an option) but also supports typing to
// filter — useful when the option list is long.
function FavSel({ value, onChange, options, configItems, favouriteNames, placeholder, large, small }) {
  // configItems: raw config array with .favourite flag, OR favouriteNames: array of favourite name strings
  const items = configItems || [];
  const favSet = favouriteNames
    ? new Set(favouriteNames)
    : new Set(items.filter(isFav).map(getItemName));
  const favOptions = (options || []).filter(o => favSet.has(o));
  const otherOptions = (options || []).filter(o => !favSet.has(o));

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const q = query.trim().toLowerCase();
  const filteredFav = q ? favOptions.filter(o => o.toLowerCase().includes(q)) : favOptions;
  const filteredOther = q ? otherOptions.filter(o => o.toLowerCase().includes(q)) : otherOptions;
  // Flat list used for keyboard navigation. "" is the "clear" sentinel.
  const flat = [...filteredFav, ...filteredOther];

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery(""); } }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function openDropdown() {
    setOpen(true);
    setQuery("");
    setFocusIdx(-1);
    // Focus the input on next tick so it's immediately typeable
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function pick(val) {
    onChange(val);
    setOpen(false);
    setQuery("");
    setFocusIdx(-1);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (focusIdx >= 0 && focusIdx < flat.length) pick(flat[focusIdx]);
      else if (flat.length === 1) pick(flat[0]);
    }
    else if (e.key === "Escape") { setOpen(false); setQuery(""); }
    else if (e.key === "Tab") { setOpen(false); setQuery(""); }
  }

  const padding = large ? "14px 16px" : small ? "3px 20px 3px 8px" : "10px 12px";
  const fontSize = large ? 20 : small ? 12 : 15;
  const fieldStyle = {
    background: "#ffffff", border: "1px solid #dadce0", color: value ? "#202124" : "#5f6368",
    padding, borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif",
    fontSize, width: "100%", outline: "none", cursor: "pointer", boxSizing: "border-box",
  };
  const display = value || placeholder || "— Select —";

  // Build rendered option rows. favourites get a star prefix.
  let idx = -1;
  const renderOption = (o, isFavRow) => {
    idx += 1;
    const i = idx;
    return (
      <div key={(isFavRow ? "f-" : "o-") + o}
        onMouseDown={e => { e.preventDefault(); pick(o); }}
        onMouseEnter={() => setFocusIdx(i)}
        style={{
          padding: small ? "6px 10px" : "8px 12px", cursor: "pointer",
          background: i === focusIdx ? "#e8f0fe" : "transparent",
          fontSize: small ? 12 : 14, color: "#202124",
        }}
      >
        {isFavRow ? "★ " : ""}{o}
      </div>
    );
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: small ? "auto" : "100%" }}>
      {open ? (
        <input ref={inputRef} type="text" value={query}
          placeholder={value || placeholder || "Type to search…"}
          onChange={e => { setQuery(e.target.value); setFocusIdx(e.target.value.trim() ? 0 : -1); }}
          onKeyDown={handleKeyDown}
          style={fieldStyle}
        />
      ) : (
        <div onClick={openDropdown} tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); openDropdown(); } }}
          style={{
            ...fieldStyle,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {display}
        </div>
      )}
      <div style={{ position: "absolute", right: small ? 4 : 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#5f6368", fontSize: small ? 10 : 14 }}>▾</div>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 30,
          background: "#ffffff", border: "1px solid #dadce0", borderRadius: 8,
          maxHeight: 240, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          minWidth: small ? 180 : undefined,
        }}>
          {/* Clear option */}
          <div onMouseDown={e => { e.preventDefault(); pick(""); }}
            style={{
              padding: small ? "6px 10px" : "8px 12px", cursor: "pointer",
              fontSize: small ? 12 : 13, color: "#5f6368", fontStyle: "italic",
              borderBottom: "1px solid #f1f3f4",
            }}
          >
            {placeholder || "— Clear —"}
          </div>
          {filteredFav.length > 0 && (
            <div style={{ padding: "4px 12px", fontSize: 11, color: "#80868b", background: "#fafafa" }}>Favourites</div>
          )}
          {filteredFav.map(o => renderOption(o, true))}
          {filteredFav.length > 0 && filteredOther.length > 0 && (
            <div style={{ padding: "4px 12px", fontSize: 11, color: "#80868b", background: "#fafafa" }}>All</div>
          )}
          {filteredOther.map(o => renderOption(o, false))}
          {flat.length === 0 && (
            <div style={{ padding: small ? "6px 10px" : "8px 12px", fontSize: small ? 12 : 13, color: "#80868b" }}>
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Multi-select tag picker with chips
function TagMultiSelect({ selected, options, onChange, placeholder, favouriteNames, tagCategories }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropRef = useRef(null);
  const searchRef = useRef(null);
  const sel = new Set(selected || []);
  const favSet = new Set(favouriteNames || []);
  const catMap = tagCategories || {};
  const allOptions = options || [];
  const q = search.toLowerCase();
  const favOptions = allOptions.filter(o => favSet.has(o) && (!q || o.toLowerCase().includes(q)));
  const otherOptions = allOptions.filter(o => !favSet.has(o) && (!q || o.toLowerCase().includes(q)));
  const count = sel.size;
  const catDot = (tag) => {
    const c = catMap[tag];
    if (!c) return null;
    return <span style={{ width: 7, height: 7, borderRadius: "50%", background: c === "good" ? "#34a853" : "#d93025", flexShrink: 0 }} title={c === "good" ? "Good time" : "Bad time"} />;
  };

  function toggle(tag) {
    if (sel.has(tag)) onChange([...selected].filter(t => t !== tag));
    else onChange([...(selected || []), tag]);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (dropRef.current && !dropRef.current.contains(e.target)) { setOpen(false); setSearch(""); } }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Auto-focus search when opening
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  if (allOptions.length === 0) return <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>No tags configured</div>;

  return (
    <div ref={dropRef} style={{ position: "relative" }}>
      {/* Toggle button */}
      <button onClick={() => { setOpen(!open); if (open) setSearch(""); }} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        background: "#ffffff", border: "1px solid #dadce0", color: count > 0 ? "#202124" : "#80868b",
        padding: "8px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif",
        fontSize: 14, cursor: "pointer", outline: "none", textAlign: "left"
      }}>
        <span>{count > 0 ? `${count} tag${count !== 1 ? "s" : ""} selected` : (placeholder || "Select tags...")}</span>
        <span style={{ color: "#5f6368", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>
      {/* Selected chips */}
      {count > 0 && !open && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {[...sel].map(tag => (
            <span key={tag} style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
              background: favSet.has(tag) ? "#fffbeb" : "#e8f0fe", color: favSet.has(tag) ? "#e37400" : "#1a73e8",
              borderRadius: 12, fontSize: 12, fontWeight: 500
            }}>
              {favSet.has(tag) ? "★ " : ""}{tag} {catDot(tag)}
              <span onClick={e => { e.stopPropagation(); toggle(tag); }}
                style={{ cursor: "pointer", fontWeight: 700, fontSize: 11 }}>×</span>
            </span>
          ))}
        </div>
      )}
      {/* Dropdown with search */}
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 20,
          background: "#ffffff", border: "1px solid #dadce0", borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", overflow: "hidden"
        }}>
          {/* Search input */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #e8eaed" }}>
            <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Escape") { setOpen(false); setSearch(""); }
              }}
              placeholder="Search tags..."
              style={{
                width: "100%", fontSize: 13, border: "1px solid #dadce0", borderRadius: 6,
                padding: "5px 10px", outline: "none", fontFamily: "'Inter', 'Roboto', sans-serif",
                background: "#f8f9fa", boxSizing: "border-box"
              }} />
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", padding: "4px 2px" }}>
            {favOptions.length > 0 && (
              <div style={{ fontSize: 10, color: "#80868b", padding: "2px 10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Favourites</div>
            )}
            {favOptions.map(tag => (
              <label key={tag} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", cursor: "pointer",
                background: sel.has(tag) ? "#fffbeb" : "transparent", borderRadius: 4
              }}
                onMouseEnter={e => { if (!sel.has(tag)) e.currentTarget.style.background = "#f8f9fa"; }}
                onMouseLeave={e => { e.currentTarget.style.background = sel.has(tag) ? "#fffbeb" : "transparent"; }}
              >
                <input type="checkbox" checked={sel.has(tag)} onChange={() => toggle(tag)}
                  style={{ accentColor: "#e37400", width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "#202124" }}>★ {tag}</span>
                {catDot(tag)}
              </label>
            ))}
            {favOptions.length > 0 && otherOptions.length > 0 && (
              <div style={{ height: 1, background: "#e8eaed", margin: "4px 10px" }} />
            )}
            {otherOptions.map(tag => (
              <label key={tag} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", cursor: "pointer",
                background: sel.has(tag) ? "#e8f0fe" : "transparent", borderRadius: 4
              }}
                onMouseEnter={e => { if (!sel.has(tag)) e.currentTarget.style.background = "#f8f9fa"; }}
                onMouseLeave={e => { e.currentTarget.style.background = sel.has(tag) ? "#e8f0fe" : "transparent"; }}
              >
                <input type="checkbox" checked={sel.has(tag)} onChange={() => toggle(tag)}
                  style={{ accentColor: "#1a73e8", width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "#202124" }}>{tag}</span>
                {catDot(tag)}
              </label>
            ))}
            {favOptions.length === 0 && otherOptions.length === 0 && (
              <div style={{ padding: "12px 10px", fontSize: 13, color: "#80868b", textAlign: "center", fontStyle: "italic" }}>No tags match "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ ADMIN LIST EDITOR ═══
function AdminList({ title, items: rawItems, onUpdate, color, favourites, onToggleFav, categories, onSetCategory }) {
  const items = rawItems || [];
  const favSet = new Set(favourites || []);
  const catMap = categories || {};
  const [val, setVal] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);

  function add() { if (val.trim() && !items.includes(val.trim())) { onUpdate([...items, val.trim()]); setVal(""); } }
  function remove(idx) { onUpdate(items.filter((_, i) => i !== idx)); setConfirmIdx(null); }
  function startEdit(idx) { setEditIdx(idx); setEditVal(items[idx]); setConfirmIdx(null); }
  function saveEdit(idx) {
    if (editVal.trim()) {
      onUpdate(items.map((it, i) => i === idx ? editVal.trim() : it));
    }
    setEditIdx(null);
  }
  function moveItem(from, to) {
    if (to < 0 || to >= items.length) return;
    const arr = [...items];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    onUpdate(arr);
  }

  const catColors = { good: { bg: "#e6f4ea", border: "#34a853", text: "#137333", label: "Good" }, bad: { bg: "#fce8e6", border: "#d93025", text: "#c5221f", label: "Bad" } };

  // Display order: favourites first, then others, preserving relative order
  const displayOrder = useMemo(() => {
    const indexed = items.map((item, idx) => ({ item, idx }));
    const favItems = indexed.filter(x => favSet.has(x.item));
    const nonFavItems = indexed.filter(x => !favSet.has(x.item));
    return [...favItems, ...nonFavItems];
  }, [items, favourites]);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || "#202124", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder={`Add ${title.toLowerCase()}...`}
          style={{ flex: 1, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 15, outline: "none" }} />
        <button onClick={add} style={{
          background: color || "#1a73e8", border: "none", color: "#ffffff", padding: "10px 16px",
          borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 700
        }}>+</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.length === 0 && <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>No {title.toLowerCase()} added yet</div>}
        {displayOrder.map(({ item, idx: i }, displayIdx) => {
          const isFavItem = favSet.has(item);
          const cat = catMap[item] || "";
          const catStyle = catColors[cat];
          const showDivider = !isFavItem && displayIdx > 0 && favSet.has(displayOrder[displayIdx - 1]?.item);
          return (
          <React.Fragment key={item + i}>
          {showDivider && <div style={{ height: 1, background: "#e8eaed", margin: "4px 0" }} />}
          <div key={item + i}
            draggable={editIdx !== i}
            onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) { moveItem(dragIdx, i); } setDragIdx(null); }}
            onDragEnd={() => setDragIdx(null)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px",
              background: dragIdx === i ? "#e8f0fe" : isFavItem ? "#fffbeb" : "#ffffff", borderRadius: 6, gap: 8,
              opacity: dragIdx === i ? 0.5 : 1, cursor: editIdx === i ? "default" : "grab"
            }}>
            {editIdx === i ? (
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                <input value={editVal} onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveEdit(i)}
                  autoFocus
                  style={{ flex: 1, background: "#ffffff", border: "1px solid #1a73e8", color: "#202124", padding: "6px 10px", borderRadius: 4, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                <button onClick={() => saveEdit(i)} style={{ background: "#1a73e8", border: "none", color: "#fff", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Save</button>
                <button onClick={() => setEditIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Cancel</button>
              </div>
            ) : (
              <>
                {/* Reorder buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                  <button onClick={() => moveItem(i, i - 1)} disabled={i === 0} style={{
                    background: "transparent", border: "none", color: i === 0 ? "#e8eaed" : "#80868b", cursor: i === 0 ? "default" : "pointer",
                    fontSize: 10, padding: 0, lineHeight: 1
                  }}>▲</button>
                  <button onClick={() => moveItem(i, i + 1)} disabled={i === items.length - 1} style={{
                    background: "transparent", border: "none", color: i === items.length - 1 ? "#e8eaed" : "#80868b", cursor: i === items.length - 1 ? "default" : "pointer",
                    fontSize: 10, padding: 0, lineHeight: 1
                  }}>▼</button>
                </div>
                {onToggleFav && <span onClick={() => onToggleFav(item)} style={{ cursor: "pointer", fontSize: 16, color: isFavItem ? "#fbbc04" : "#dadce0", flexShrink: 0 }} title={isFavItem ? "Remove from favourites" : "Add to favourites"}>{isFavItem ? "★" : "☆"}</span>}
                <span onClick={() => startEdit(i)} style={{ fontSize: 15, color: "#202124", cursor: "pointer", flex: 1 }} title="Click to edit">{item}</span>
                {onSetCategory && (
                  <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    {["good", "bad"].map(c => (
                      <button key={c} onClick={() => onSetCategory(item, cat === c ? "" : c)} style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, cursor: "pointer",
                        background: cat === c ? catColors[c].bg : "transparent",
                        color: cat === c ? catColors[c].text : "#bdc1c6",
                        border: `1px solid ${cat === c ? catColors[c].border : "#e8eaed"}`
                      }}>{catColors[c].label}</button>
                    ))}
                  </div>
                )}
                {confirmIdx === i ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "#d93025", whiteSpace: "nowrap" }}>Delete?</span>
                    <button onClick={() => remove(i)} style={{ background: "#d93025", border: "none", color: "#fff", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Yes</button>
                    <button onClick={() => setConfirmIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>No</button>
                  </div>
                ) : (
                  <button onClick={() => { setConfirmIdx(i); setEditIdx(null); }} style={{
                    background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 10px",
                    borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                  }}
                    onMouseEnter={e => { e.target.style.borderColor = "#d93025"; e.target.style.color = "#d93025"; }}
                    onMouseLeave={e => { e.target.style.borderColor = "#dadce0"; e.target.style.color = "#80868b"; }}
                  >×</button>
                )}
              </>
            )}
          </div>
          </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Admin list for items with name + code — editable with delete confirmation
function AdminCodeList({ title, items: rawItems, onUpdate, color }) {
  const items = rawItems || [];
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);

  function add() {
    if (name.trim()) {
      const exists = items.some(it => getItemName(it) === name.trim());
      if (!exists) { onUpdate([...items, { name: name.trim(), code: code.trim() }]); setName(""); setCode(""); }
    }
  }
  function remove(idx) { onUpdate(items.filter((_, i) => i !== idx)); setConfirmIdx(null); }
  function startEdit(idx) {
    const item = items[idx];
    setEditIdx(idx); setEditName(getItemName(item)); setEditCode(getItemCode(item)); setConfirmIdx(null);
  }
  function saveEdit(idx) {
    if (editName.trim()) {
      onUpdate(items.map((it, i) => i === idx ? { ...(typeof it === "object" ? it : {}), name: editName.trim(), code: editCode.trim() } : it));
    }
    setEditIdx(null);
  }
  function toggleFav(idx) {
    onUpdate(items.map((it, i) => {
      if (i !== idx) return it;
      const obj = typeof it === "object" ? it : { name: it };
      return { ...obj, favourite: !obj.favourite };
    }));
  }
  function moveItem(from, to) {
    if (to < 0 || to >= items.length) return;
    const arr = [...items]; const [moved] = arr.splice(from, 1); arr.splice(to, 0, moved); onUpdate(arr);
  }

  const displayOrder = useMemo(() => {
    const indexed = items.map((item, idx) => ({ item, idx }));
    const favItems = indexed.filter(x => isFav(x.item));
    const nonFavItems = indexed.filter(x => !isFav(x.item));
    return [...favItems, ...nonFavItems];
  }, [items]);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || "#202124", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Name..."
          style={{ flex: 2, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 15, outline: "none" }} />
        <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Code..."
          style={{ flex: 1, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 15, outline: "none" }} />
        <button onClick={add} style={{
          background: color || "#1a73e8", border: "none", color: "#ffffff", padding: "10px 16px",
          borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 700
        }}>+</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.length === 0 && <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>No {title.toLowerCase()} added yet</div>}
        {displayOrder.map(({ item, idx: i }, displayIdx) => {
          const itemName = getItemName(item);
          const itemCode = getItemCode(item);
          const fav = isFav(item);
          const showDivider = !fav && displayIdx > 0 && isFav(displayOrder[displayIdx - 1]?.item);
          return (
            <React.Fragment key={itemName + i}>
            {showDivider && <div style={{ height: 1, background: "#e8eaed", margin: "4px 0" }} />}
            <div
              draggable={editIdx !== i}
              onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) moveItem(dragIdx, i); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: dragIdx === i ? "#e8f0fe" : fav ? "#fffbeb" : "#ffffff", borderRadius: 6, gap: 8, opacity: dragIdx === i ? 0.5 : 1, cursor: editIdx === i ? "default" : "grab" }}>
              {editIdx === i ? (
                <div style={{ flex: 1, display: "flex", gap: 6 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEdit(i)} autoFocus
                    placeholder="Name..."
                    style={{ flex: 2, background: "#ffffff", border: "1px solid #1a73e8", color: "#202124", padding: "6px 10px", borderRadius: 4, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                  <input value={editCode} onChange={e => setEditCode(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEdit(i)}
                    placeholder="Code..."
                    style={{ flex: 1, background: "#ffffff", border: "1px solid #1a73e8", color: "#202124", padding: "6px 10px", borderRadius: 4, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                  <button onClick={() => saveEdit(i)} style={{ background: "#1a73e8", border: "none", color: "#fff", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Save</button>
                  <button onClick={() => setEditIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Cancel</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                    <button onClick={() => moveItem(i, i - 1)} disabled={i === 0} style={{ background: "transparent", border: "none", color: i === 0 ? "#e8eaed" : "#80868b", cursor: i === 0 ? "default" : "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>▲</button>
                    <button onClick={() => moveItem(i, i + 1)} disabled={i === items.length - 1} style={{ background: "transparent", border: "none", color: i === items.length - 1 ? "#e8eaed" : "#80868b", cursor: i === items.length - 1 ? "default" : "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>▼</button>
                  </div>
                  <span onClick={() => toggleFav(i)} style={{ cursor: "pointer", fontSize: 16, color: fav ? "#fbbc04" : "#dadce0", flexShrink: 0 }} title={fav ? "Remove from favourites" : "Add to favourites"}>{fav ? "★" : "☆"}</span>
                  <div onClick={() => startEdit(i)} style={{ cursor: "pointer", flex: 1 }} title="Click to edit">
                    <span style={{ fontSize: 15, color: "#202124" }}>{itemName}</span>
                    {itemCode && <span style={{ fontSize: 13, color: "#80868b", marginLeft: 8 }}>({itemCode})</span>}
                  </div>
                  {confirmIdx === i ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: "#d93025", whiteSpace: "nowrap" }}>Delete {itemName}?</span>
                      <button onClick={() => remove(i)} style={{ background: "#d93025", border: "none", color: "#fff", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Yes</button>
                      <button onClick={() => setConfirmIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>No</button>
                    </div>
                  ) : (
                    <button onClick={() => { setConfirmIdx(i); setEditIdx(null); }} style={{
                      background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 10px",
                      borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                    }}
                      onMouseEnter={e => { e.target.style.borderColor = "#d93025"; e.target.style.color = "#d93025"; }}
                      onMouseLeave={e => { e.target.style.borderColor = "#dadce0"; e.target.style.color = "#80868b"; }}
                    >×</button>
                  )}
                </>
              )}
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Helper to get name from a coded config item (supports old string format and new {name,code} format)
function getItemName(item) { return typeof item === "object" ? item.name : item; }
function getItemCode(item) { return typeof item === "object" ? (item.code || "") : ""; }
function getItemLabel(item) {
  const n = getItemName(item);
  const c = getItemCode(item);
  return c ? `${n} (${c})` : n;
}
function getItemNames(items) { return (items || []).map(getItemName); }

// Activity Template Editor
function ActivityTemplateEditor({ templates, onUpdate, color, favouriteActivities, onToggleFav }) {
  const [newName, setNewName] = useState("");
  const [editingIdx, setEditingIdx] = useState(null);
  const [newActivity, setNewActivity] = useState("");
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [editNameIdx, setEditNameIdx] = useState(null);
  const [editNameVal, setEditNameVal] = useState("");

  function addTemplate() {
    if (newName.trim() && !templates.some(t => t.name === newName.trim())) {
      onUpdate([...templates, { name: newName.trim(), activities: [] }]);
      setNewName("");
    }
  }
  function removeTemplate(idx) {
    onUpdate(templates.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
    setConfirmIdx(null);
  }
  function startEditName(idx, e) {
    e.stopPropagation();
    setEditNameIdx(idx); setEditNameVal(templates[idx].name); setConfirmIdx(null);
  }
  function saveEditName(idx) {
    if (editNameVal.trim()) {
      onUpdate(templates.map((t, i) => i === idx ? { ...t, name: editNameVal.trim() } : t));
    }
    setEditNameIdx(null);
  }
  function addActivity(tIdx) {
    if (newActivity.trim()) {
      const updated = templates.map((t, i) => i === tIdx ? { ...t, activities: [...t.activities, newActivity.trim()] } : t);
      onUpdate(updated);
      setNewActivity("");
    }
  }
  function removeActivity(tIdx, aIdx) {
    const updated = templates.map((t, i) => i === tIdx ? { ...t, activities: t.activities.filter((_, j) => j !== aIdx) } : t);
    onUpdate(updated);
  }

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", gridColumn: "1 / -1" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || "#202124", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 }}>Activity Templates</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addTemplate()}
          placeholder="New template name..."
          style={{ flex: 1, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 15, outline: "none" }} />
        <button onClick={addTemplate} style={{
          background: color || "#8b5cf6", border: "none", color: "#ffffff", padding: "10px 16px",
          borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 700
        }}>+ Template</button>
      </div>
      {templates.length === 0 && <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>No activity templates yet. Create one and assign it to projects.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.map((tmpl, tIdx) => (
          <div key={tmpl.name} style={{ border: "1px solid #dadce0", borderRadius: 10, overflow: "hidden" }}>
            {/* Template header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
              background: editingIdx === tIdx ? "#e8f0fe" : "#f8f9fa", cursor: "pointer"
            }} onClick={() => { setEditingIdx(editingIdx === tIdx ? null : tIdx); setConfirmIdx(null); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                {editNameIdx === tIdx ? (
                  <div style={{ display: "flex", gap: 6, flex: 1 }} onClick={e => e.stopPropagation()}>
                    <input value={editNameVal} onChange={e => setEditNameVal(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveEditName(tIdx)} autoFocus
                      style={{ flex: 1, background: "#fff", border: "1px solid #1a73e8", color: "#202124", padding: "4px 8px", borderRadius: 4, fontSize: 14, outline: "none" }} />
                    <button onClick={() => saveEditName(tIdx)} style={{ background: "#1a73e8", border: "none", color: "#fff", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Save</button>
                    <button onClick={() => setEditNameIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#202124" }} onDoubleClick={e => startEditName(tIdx, e)} title="Double-click to rename">{tmpl.name}</span>
                    <span style={{ fontSize: 13, color: "#5f6368" }}>{tmpl.activities.length} activit{tmpl.activities.length === 1 ? "y" : "ies"}</span>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={e => { e.stopPropagation(); startEditName(tIdx, e); }} style={{
                  background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 10px",
                  borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                }}
                  onMouseEnter={e => { e.target.style.borderColor = "#1a73e8"; e.target.style.color = "#1a73e8"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "#dadce0"; e.target.style.color = "#80868b"; }}
                >✎</button>
                <span style={{ fontSize: 13, color: "#5f6368" }}>{editingIdx === tIdx ? "▲" : "▼"}</span>
                {confirmIdx === tIdx ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: 12, color: "#d93025", whiteSpace: "nowrap" }}>Delete?</span>
                    <button onClick={() => removeTemplate(tIdx)} style={{ background: "#d93025", border: "none", color: "#fff", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Yes</button>
                    <button onClick={() => setConfirmIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>No</button>
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setConfirmIdx(tIdx); }} style={{
                    background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 10px",
                    borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                  }}
                    onMouseEnter={e => { e.target.style.borderColor = "#d93025"; e.target.style.color = "#d93025"; }}
                    onMouseLeave={e => { e.target.style.borderColor = "#dadce0"; e.target.style.color = "#80868b"; }}
                  >×</button>
                )}
              </div>
            </div>
            {/* Expanded activities list */}
            {editingIdx === tIdx && (
              <div style={{ padding: "12px 14px", borderTop: "1px solid #dadce0" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input value={newActivity} onChange={e => setNewActivity(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { addActivity(tIdx); } }}
                    placeholder="Add activity..."
                    style={{ flex: 1, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                  <button onClick={() => addActivity(tIdx)} style={{
                    background: color || "#8b5cf6", border: "none", color: "#ffffff", padding: "8px 14px",
                    borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 700
                  }}>+</button>
                </div>
                {tmpl.activities.length === 0 && <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>No activities in this template</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tmpl.activities.map((act, aIdx) => {
                    const actFav = (favouriteActivities || []).includes(act);
                    return (
                    <div key={act + aIdx} style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                      background: actFav ? "#fffbeb" : "#f1f3f4", borderRadius: 16, fontSize: 14, color: "#202124"
                    }}>
                      {onToggleFav && <span onClick={() => onToggleFav(act)} style={{ cursor: "pointer", fontSize: 14, color: actFav ? "#fbbc04" : "#dadce0" }}>{actFav ? "★" : "☆"}</span>}
                      {act}
                      <span onClick={() => removeActivity(tIdx, aIdx)} style={{
                        cursor: "pointer", color: "#80868b", fontWeight: 700, fontSize: 12
                      }}
                        onMouseEnter={e => e.target.style.color = "#d93025"}
                        onMouseLeave={e => e.target.style.color = "#80868b"}
                      >×</span>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Project Editor with template assignment
function ProjectEditor({ items: rawItems, templates, customers, onUpdate, color }) {
  const items = rawItems || [];
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [tmpl, setTmpl] = useState("");
  const [cust, setCust] = useState("");
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [dragIdx, setDragIdx] = useState(null);

  function add() {
    if (name.trim()) {
      const exists = items.some(it => getItemName(it) === name.trim());
      if (!exists) {
        onUpdate([...items, { name: name.trim(), code: code.trim(), activityTemplate: tmpl, customer: cust }]);
        setName(""); setCode(""); setTmpl(""); setCust("");
      }
    }
  }
  function remove(idx) { onUpdate(items.filter((_, i) => i !== idx)); setConfirmIdx(null); }
  function updateField(idx, field, value) {
    onUpdate(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }
  function toggleFav(idx) {
    onUpdate(items.map((it, i) => i === idx ? { ...it, favourite: !it.favourite } : it));
  }
  function startEdit(idx) {
    setEditIdx(idx); setEditName(getItemName(items[idx])); setEditCode(getItemCode(items[idx])); setConfirmIdx(null);
  }
  function saveEdit(idx) {
    if (editName.trim()) {
      onUpdate(items.map((it, i) => i === idx ? { ...it, name: editName.trim(), code: editCode.trim() } : it));
    }
    setEditIdx(null);
  }
  function moveItem(from, to) {
    if (to < 0 || to >= items.length) return;
    const arr = [...items]; const [moved] = arr.splice(from, 1); arr.splice(to, 0, moved); onUpdate(arr);
  }

  const displayOrder = useMemo(() => {
    const indexed = items.map((item, idx) => ({ item, idx }));
    return [...indexed.filter(x => isFav(x.item)), ...indexed.filter(x => !isFav(x.item))];
  }, [items]);

  const tmplNames = (templates || []).map(t => t.name);
  const custNames = getItemNames(customers);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || "#202124", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 }}>Projects</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Name..."
          style={{ flex: 2, minWidth: 120, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 15, outline: "none" }} />
        <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Code..."
          style={{ flex: 1, minWidth: 80, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 15, outline: "none" }} />
        <select value={cust} onChange={e => setCust(e.target.value)}
          style={{ flex: 1, minWidth: 120, background: "#ffffff", border: "1px solid #dadce0", color: cust ? "#202124" : "#80868b", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none", cursor: "pointer" }}>
          <option value="">Customer...</option>
          {custNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={tmpl} onChange={e => setTmpl(e.target.value)}
          style={{ flex: 1, minWidth: 120, background: "#ffffff", border: "1px solid #dadce0", color: tmpl ? "#202124" : "#80868b", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none", cursor: "pointer" }}>
          <option value="">Template...</option>
          {tmplNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={add} style={{
          background: color || "#1a73e8", border: "none", color: "#ffffff", padding: "10px 16px",
          borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 700
        }}>+</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.length === 0 && <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>No projects added yet</div>}
        {displayOrder.map(({ item, idx: i }, displayIdx) => {
          const itemName = getItemName(item);
          const itemCode = getItemCode(item);
          const itemTmpl = typeof item === "object" ? (item.activityTemplate || "") : "";
          const itemCust = typeof item === "object" ? (item.customer || "") : "";
          const fav = isFav(item);
          const showDivider = !fav && displayIdx > 0 && isFav(displayOrder[displayIdx - 1]?.item);
          return (
            <React.Fragment key={itemName + i}>
            {showDivider && <div style={{ height: 1, background: "#e8eaed", margin: "4px 0" }} />}
            <div draggable={editIdx !== i}
              onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) moveItem(dragIdx, i); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: dragIdx === i ? "#e8f0fe" : fav ? "#fffbeb" : "#ffffff", borderRadius: 6, flexWrap: "wrap", opacity: dragIdx === i ? 0.5 : 1, cursor: editIdx === i ? "default" : "grab" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                <button onClick={() => moveItem(i, i - 1)} disabled={i === 0} style={{ background: "transparent", border: "none", color: i === 0 ? "#e8eaed" : "#80868b", cursor: i === 0 ? "default" : "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>▲</button>
                <button onClick={() => moveItem(i, i + 1)} disabled={i === items.length - 1} style={{ background: "transparent", border: "none", color: i === items.length - 1 ? "#e8eaed" : "#80868b", cursor: i === items.length - 1 ? "default" : "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>▼</button>
              </div>
              <span onClick={() => toggleFav(i)} style={{ cursor: "pointer", fontSize: 16, color: fav ? "#fbbc04" : "#dadce0", flexShrink: 0 }} title={fav ? "Remove from favourites" : "Add to favourites"}>{fav ? "★" : "☆"}</span>
              {editIdx === i ? (
                <div style={{ display: "flex", gap: 6, flex: "1 1 auto", minWidth: 100 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEdit(i)} placeholder="Name..."
                    autoFocus
                    style={{ flex: 2, background: "#ffffff", border: "1px solid #1a73e8", color: "#202124", padding: "6px 10px", borderRadius: 4, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                  <input value={editCode} onChange={e => setEditCode(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEdit(i)} placeholder="Code..."
                    style={{ flex: 1, background: "#ffffff", border: "1px solid #1a73e8", color: "#202124", padding: "6px 10px", borderRadius: 4, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                  <button onClick={() => saveEdit(i)} style={{ background: "#1a73e8", border: "none", color: "#fff", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Save</button>
                  <button onClick={() => setEditIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Cancel</button>
                </div>
              ) : (
                <div onClick={() => startEdit(i)} style={{ flex: "1 1 auto", minWidth: 100, cursor: "pointer" }} title="Click to edit">
                  <span style={{ fontSize: 15, color: "#202124" }}>{itemName}</span>
                  {itemCode && <span style={{ fontSize: 13, color: "#80868b", marginLeft: 8 }}>({itemCode})</span>}
                </div>
              )}
              <select value={itemCust} onChange={e => updateField(i, "customer", e.target.value)}
                style={{ background: "#f8f9fa", border: "1px solid #dadce0", color: itemCust ? "#202124" : "#80868b", padding: "5px 10px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, outline: "none", cursor: "pointer", minWidth: 120 }}>
                <option value="">No customer</option>
                {custNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={itemTmpl} onChange={e => updateField(i, "activityTemplate", e.target.value)}
                style={{ background: "#f8f9fa", border: "1px solid #dadce0", color: itemTmpl ? "#202124" : "#80868b", padding: "5px 10px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, outline: "none", cursor: "pointer", minWidth: 120 }}>
                <option value="">No template</option>
                {tmplNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {confirmIdx === i ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: "#d93025", whiteSpace: "nowrap" }}>Delete {itemName}?</span>
                  <button onClick={() => { remove(i); setConfirmIdx(null); }} style={{
                    background: "#d93025", border: "none", color: "#ffffff", padding: "4px 12px",
                    borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                  }}>Yes</button>
                  <button onClick={() => setConfirmIdx(null)} style={{
                    background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 12px",
                    borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                  }}>No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmIdx(i)} style={{
                  background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 10px",
                  borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                }}
                  onMouseEnter={e => { e.target.style.borderColor = "#d93025"; e.target.style.color = "#d93025"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "#dadce0"; e.target.style.color = "#80868b"; }}
                >×</button>
              )}
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Work Order Editor with project assignment and delete confirmation
function WorkOrderEditor({ items: rawItems, projects, onUpdate, color }) {
  const items = rawItems || [];
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [proj, setProj] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);

  function add() {
    if (name.trim()) {
      const exists = items.some(it => getItemName(it) === name.trim());
      if (!exists) {
        onUpdate([...items, { name: name.trim(), code: code.trim(), project: proj }]);
        setName(""); setCode(""); setProj("");
      }
    }
  }
  function remove(idx) { onUpdate(items.filter((_, i) => i !== idx)); setConfirmIdx(null); }
  function updateField(idx, field, value) {
    onUpdate(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }
  function toggleFav(idx) {
    onUpdate(items.map((it, i) => i === idx ? { ...it, favourite: !it.favourite } : it));
  }
  function startEdit(idx) {
    const item = items[idx];
    setEditIdx(idx); setEditName(getItemName(item)); setEditCode(getItemCode(item)); setConfirmIdx(null);
  }
  function saveEdit(idx) {
    if (editName.trim()) {
      onUpdate(items.map((it, i) => i === idx ? { ...(typeof it === "object" ? it : {}), name: editName.trim(), code: editCode.trim() } : it));
    }
    setEditIdx(null);
  }
  function moveItem(from, to) {
    if (to < 0 || to >= items.length) return;
    const arr = [...items]; const [moved] = arr.splice(from, 1); arr.splice(to, 0, moved); onUpdate(arr);
  }

  const displayOrder = useMemo(() => {
    const indexed = items.map((item, idx) => ({ item, idx }));
    return [...indexed.filter(x => isFav(x.item)), ...indexed.filter(x => !isFav(x.item))];
  }, [items]);

  const projNames = getItemNames(projects);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || "#202124", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 }}>Work Orders</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Name..."
          style={{ flex: 2, minWidth: 120, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 15, outline: "none" }} />
        <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Code..."
          style={{ flex: 1, minWidth: 80, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 15, outline: "none" }} />
        <select value={proj} onChange={e => setProj(e.target.value)}
          style={{ flex: 1, minWidth: 120, background: "#ffffff", border: "1px solid #dadce0", color: proj ? "#202124" : "#80868b", padding: "10px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none", cursor: "pointer" }}>
          <option value="">Project...</option>
          {projNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={add} style={{
          background: color || "#1a73e8", border: "none", color: "#ffffff", padding: "10px 16px",
          borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 700
        }}>+</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.length === 0 && <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>No work orders added yet</div>}
        {displayOrder.map(({ item, idx: i }, displayIdx) => {
          const itemName = getItemName(item);
          const itemCode = getItemCode(item);
          const itemProj = typeof item === "object" ? (item.project || "") : "";
          const fav = isFav(item);
          const showDivider = !fav && displayIdx > 0 && isFav(displayOrder[displayIdx - 1]?.item);
          return (
            <React.Fragment key={itemName + i}>
            {showDivider && <div style={{ height: 1, background: "#e8eaed", margin: "4px 0" }} />}
            <div draggable={editIdx !== i}
              onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) moveItem(dragIdx, i); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: dragIdx === i ? "#e8f0fe" : fav ? "#fffbeb" : "#ffffff", borderRadius: 6, flexWrap: "wrap", opacity: dragIdx === i ? 0.5 : 1, cursor: editIdx === i ? "default" : "grab" }}>
              {editIdx === i ? (
                <div style={{ flex: 1, display: "flex", gap: 6 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEdit(i)} autoFocus placeholder="Name..."
                    style={{ flex: 2, background: "#ffffff", border: "1px solid #1a73e8", color: "#202124", padding: "6px 10px", borderRadius: 4, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                  <input value={editCode} onChange={e => setEditCode(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEdit(i)} placeholder="Code..."
                    style={{ flex: 1, background: "#ffffff", border: "1px solid #1a73e8", color: "#202124", padding: "6px 10px", borderRadius: 4, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                  <button onClick={() => saveEdit(i)} style={{ background: "#1a73e8", border: "none", color: "#fff", padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Save</button>
                  <button onClick={() => setEditIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Cancel</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                    <button onClick={() => moveItem(i, i - 1)} disabled={i === 0} style={{ background: "transparent", border: "none", color: i === 0 ? "#e8eaed" : "#80868b", cursor: i === 0 ? "default" : "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>▲</button>
                    <button onClick={() => moveItem(i, i + 1)} disabled={i === items.length - 1} style={{ background: "transparent", border: "none", color: i === items.length - 1 ? "#e8eaed" : "#80868b", cursor: i === items.length - 1 ? "default" : "pointer", fontSize: 10, padding: 0, lineHeight: 1 }}>▼</button>
                  </div>
                  <span onClick={() => toggleFav(i)} style={{ cursor: "pointer", fontSize: 16, color: fav ? "#fbbc04" : "#dadce0", flexShrink: 0 }} title={fav ? "Remove from favourites" : "Add to favourites"}>{fav ? "★" : "☆"}</span>
                  <div onClick={() => startEdit(i)} style={{ flex: "1 1 auto", minWidth: 100, cursor: "pointer" }} title="Click to edit">
                    <span style={{ fontSize: 15, color: "#202124" }}>{itemName}</span>
                    {itemCode && <span style={{ fontSize: 13, color: "#80868b", marginLeft: 8 }}>({itemCode})</span>}
                  </div>
                  <select value={itemProj} onChange={e => updateField(i, "project", e.target.value)}
                    style={{ background: "#f8f9fa", border: "1px solid #dadce0", color: itemProj ? "#202124" : "#80868b", padding: "5px 10px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, outline: "none", cursor: "pointer", minWidth: 120 }}>
                    <option value="">No project</option>
                    {projNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {confirmIdx === i ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: "#d93025", whiteSpace: "nowrap" }}>Delete {itemName}?</span>
                      <button onClick={() => remove(i)} style={{ background: "#d93025", border: "none", color: "#fff", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Yes</button>
                      <button onClick={() => setConfirmIdx(null)} style={{ background: "#f1f3f4", border: "1px solid #dadce0", color: "#202124", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>No</button>
                    </div>
                  ) : (
                    <button onClick={() => { setConfirmIdx(i); setEditIdx(null); }} style={{
                      background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 10px",
                      borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                    }}
                      onMouseEnter={e => { e.target.style.borderColor = "#d93025"; e.target.style.color = "#d93025"; }}
                      onMouseLeave={e => { e.target.style.borderColor = "#dadce0"; e.target.style.color = "#80868b"; }}
                    >×</button>
                  )}
                </>
              )}
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Note input with autocomplete from previous entries
function NoteAutoComplete({ value, onChange, onSelectEntry, onEnter, noteHistory, placeholder, inputRef, isTextarea }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const wrapRef = useRef(null);

  const query = (value || "").trim().toLowerCase();
  const suggestions = query.length >= 2
    ? noteHistory.filter(h => h.note.toLowerCase().includes(query) && h.note !== value).slice(0, 8)
    : [];

  useEffect(() => {
    if (!showSuggestions) return;
    function handleClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSuggestions(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSuggestions]);

  function handleChange(newVal) {
    onChange(newVal);
    setShowSuggestions(true);
    setFocusIdx(-1);
  }

  function selectSuggestion(entry) {
    onChange(entry.note);
    setShowSuggestions(false);
    if (onSelectEntry) onSelectEntry(entry);
  }

  function handleKeyDown(e) {
    if (e.key === "Tab" && showSuggestions && suggestions.length > 0 && focusIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[focusIdx]);
      return;
    }
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      setShowSuggestions(false);
      onEnter();
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Escape") setShowSuggestions(false);
  }

  const inputProps = {
    ref: inputRef,
    value: value || "",
    onChange: e => handleChange(e.target.value),
    onFocus: () => { if (query.length >= 2) setShowSuggestions(true); },
    onKeyDown: handleKeyDown,
    placeholder: placeholder || "What are you working on...",
    style: {
      width: "100%", background: "#ffffff", border: "1px solid #dadce0", color: "#202124",
      padding: isTextarea ? "10px 12px" : "12px 16px", borderRadius: isTextarea ? 8 : 10,
      fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: isTextarea ? 14 : 16,
      outline: "none", boxSizing: "border-box", ...(isTextarea ? { resize: "vertical" } : {})
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: isTextarea ? undefined : 1 }}>
      {isTextarea
        ? <textarea {...inputProps} rows={2} />
        : <input {...inputProps} />
      }
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 20,
          background: "#ffffff", border: "1px solid #dadce0", borderRadius: 8,
          maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
        }}>
          {suggestions.map((entry, i) => (
            <div key={entry.note + i}
              onMouseDown={e => { e.preventDefault(); selectSuggestion(entry); }}
              style={{
                padding: "8px 12px", cursor: "pointer",
                background: i === focusIdx ? "#e8f0fe" : "transparent",
                borderBottom: i < suggestions.length - 1 ? "1px solid #f1f3f4" : "none"
              }}
              onMouseEnter={() => setFocusIdx(i)}
            >
              <div style={{ fontSize: 14, color: "#202124", fontWeight: 500 }}>{entry.note}</div>
              <div style={{ fontSize: 11, color: "#80868b", marginTop: 2 }}>
                {[entry.activity, entry.project, entry.customer].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ MAIN APP ═══
export default function WorkHoursTracker({ onImport }) {
  const { user } = useAuth();
  const userId = user?.id || 'local';
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentWeek, setCurrentWeek] = useState(getWeekNumber(now));
  const [standardHours, setStandardHours] = useState(STANDARD_WEEKLY_HOURS.toString());
  const [defaults, setDefaults] = useState({ customer: "", project: "", workOrder: "", activity: "", role: "", billRate: "", startTime: "09:00", endTime: "17:30" });
  const [allData, setAllData] = useState({});
  const [config, setConfig] = useState({ customers: [], projects: [], workOrders: [], activities: [], tags: [], activityTemplates: [], favouriteActivities: [], roles: [], favouriteRoles: [], favouriteTags: [], billRates: [], favouriteBillRates: [], tagCategories: {}, bankHolidayRegion: "", customHolidays: {}, showDailyQuote: true, taskTemplates: [] });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [quoteDismissed, setQuoteDismissed] = useState("");
  const [quoteOffset, setQuoteOffset] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [tasksLoadError, setTasksLoadError] = useState("");
  // Automatic backups
  const [backups, setBackups] = useState([]);
  const [backupsVersion, setBackupsVersion] = useState(0);
  const [backupsTableMissing, setBackupsTableMissing] = useState(false);
  const [backupBusy, setBackupBusy] = useState("");
  const [didAutoBackup, setDidAutoBackup] = useState(false);
  // Profiles (multi-profile support, requires migration 004)
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState("default");
  const [profilesAvailable, setProfilesAvailable] = useState(false);
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [profileSwitching, setProfileSwitching] = useState(false);
  // Only pass a profile id to the storage layer once profiles have been
  // detected as available (migration 004 applied). Before that, the storage
  // adapter behaves exactly as it did pre-profiles so nothing breaks.
  const effectiveProfileId = profilesAvailable ? activeProfileId : null;
  const storageAdapter = useMemo(
    () => getStorage(userId, effectiveProfileId),
    [userId, effectiveProfileId],
  );
  // Organization (requires migration 005)
  const [org, setOrg] = useState(null); // { org_id, role, organizations: { id, name, invite_code } }
  const [orgMembers, setOrgMembers] = useState([]);
  const [orgConfig, setOrgConfig] = useState(null);
  const [orgVersion, setOrgVersion] = useState(0);
  // Portfolio (requires migration 006)
  const [orgPortfolios, setOrgPortfolios] = useState([]);
  const [myPortfolioMemberships, setMyPortfolioMemberships] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [portfolioMemberMap, setPortfolioMemberMap] = useState({});
  const [portfolioEntries, setPortfolioEntries] = useState([]);
  const [portfolioTasks, setPortfolioTasks] = useState([]);
  const [portfolioWeekKey, setPortfolioWeekKey] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  // Organization-aware config resolution
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const isOrgProfile = !!(activeProfile?.organization_id);
  const isOrgAdmin = org?.role === 'admin';
  const orgId = org?.organizations?.id || org?.org_id || null;

  const activeConfig = useMemo(() => {
    if (!isOrgProfile || !orgConfig) return config;
    return {
      ...config,
      customers: orgConfig.customers || [],
      projects: orgConfig.projects || [],
      workOrders: orgConfig.workOrders || [],
      activities: orgConfig.activities || [],
      activityTemplates: orgConfig.activityTemplates || [],
      roles: orgConfig.roles || [],
      billRates: orgConfig.billRates || [],
      tags: [...(orgConfig.tags || []), ...(config.customTags || [])],
    };
  }, [config, orgConfig, isOrgProfile]);

  // Whether the current user manages any portfolio (shows portfolio tab)
  const isPortfolioManager = myPortfolioMemberships.some(m => m.role === 'manager');

  const [taskFilter, setTaskFilter] = useState("all"); // all, not_started, in_progress, on_hold
  const [taskSort, setTaskSort] = useState("priority"); // priority, due, title
  const [taskDurationFilter, setTaskDurationFilter] = useState(0);
  const [taskSearch, setTaskSearch] = useState(""); // 0 = all, or specific duration value
  const [showCompleted, setShowCompleted] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskEntry, setNewTaskEntry] = useState(null);
  const [taskView, setTaskView] = useState("list"); // "list" or "myday"
  const todayStr = dateStr(now);
  const [myDay, setMyDay] = useState({ date: todayStr, frog: "", priorities: [] });
  const [priDragIdx, setPriDragIdx] = useState(null);
  const [schedulingTask, setSchedulingTask] = useState(null);
  const [taskReportView, setTaskReportView] = useState("weekly");
  const [taskReportWeek, setTaskReportWeek] = useState(getWeekNumber(now));
  const [taskReportWeekYear, setTaskReportWeekYear] = useState(now.getFullYear());
  const [taskReportMonth, setTaskReportMonth] = useState(now.getMonth());
  const [taskReportMonthYear, setTaskReportMonthYear] = useState(now.getFullYear());
  const [taskReportYear, setTaskReportYear] = useState(now.getFullYear());
  const [taskReportExpanded, setTaskReportExpanded] = useState(null);
  const [schedSelId, setSchedSelId] = useState(null);
  const [schedDrag, setSchedDrag] = useState(null);
  const [schedFilter, setSchedFilter] = useState({ search: "", project: "", customer: "", workOrder: "", duration: 0, status: "all" }); // { id, type: "start"|"end", startY }
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewConfirm, setReviewConfirm] = useState(null);
  const [reviewTaskIds, setReviewTaskIds] = useState([]);
  const [reviewFilter, setReviewFilter] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [undoVisible, setUndoVisible] = useState(false);
  useEffect(() => {
    if (undoStack.length === 0) { setUndoVisible(false); return; }
    setUndoVisible(true);
    const t = setTimeout(() => setUndoVisible(false), 6000);
    return () => clearTimeout(t);
  }, [undoStack]);
  const [taskGroupBy, setTaskGroupBy] = useState("none");
  const [kanbanSort, setKanbanSort] = useState("status");
  const [batchSelected, setBatchSelected] = useState(new Set());
  const [batchAction, setBatchAction] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [taskDragId, setTaskDragId] = useState(null); // none, project, customer
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingTaskId, setEditingTaskId_raw] = useState(null);
  const [newTaskId, setNewTaskId] = useState(null);
  const setEditingTaskId = (id) => { setEditingTaskId_raw(id); if (id !== newTaskId) setNewTaskId(null); };
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [lastSaved, setLastSaved] = useState(null);

  const todayIdx = (now.getDay() + 6) % 7;
  const [entryDayIndex, setEntryDayIndex] = useState(todayIdx);
  const [calendarView, setCalendarView] = useState("day");
  const [calScroll, setCalScroll] = useState(getDefaultScroll);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [recurPrompt, setRecurPrompt] = useState(null);
  const [copiedEntry, setCopiedEntry] = useState(null);
  const newEntryRef = useRef(null);
  const noteRef = useRef(null);
  const timerNoteRef = useRef(null);

  // Auto-focus note field when a new entry is created
  useEffect(() => {
    if (newEntryRef.current && selectedEntryId === newEntryRef.current) {
      newEntryRef.current = null;
      setTimeout(() => { if (noteRef.current) noteRef.current.focus(); }, 50);
    }
    setRecurPrompt(null);
  }, [selectedEntryId]);

  // Close edit panel on Enter/Escape
  useEffect(() => {
    if (!selectedEntryId) return;
    function handleKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedEntryId(null);
      }
      if (e.key === "Enter") {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "select") return;
        e.preventDefault();
        setSelectedEntryId(null);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedEntryId]);

  // Ctrl+C / Ctrl+V for copy/paste time blocks
  useEffect(() => {
    if (activeTab !== "week") return;
    function handleCopyPaste(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select";
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !isInput && selectedEntryId) {
        e.preventDefault();
        copyEntry(selectedEntryId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !isInput && copiedEntry) {
        e.preventDefault();
        if (selectedEntryId) {
          pasteIntoSelected();
        } else {
          pasteEntry();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !isInput) {
        e.preventDefault();
        performUndo();
      }
    }
    document.addEventListener("keydown", handleCopyPaste);
    return () => document.removeEventListener("keydown", handleCopyPaste);
  }, [activeTab, selectedEntryId, copiedEntry]);

  // Reports state
  const [reportGroup, setReportGroup] = useState("none");
  const [reportGroupBy, setReportGroupBy] = useState("weekly");
  const [reportFilterField, setReportFilterField] = useState("none");
  const [reportFilterValues, setReportFilterValues] = useState([]);
  const [reportMonth, setReportMonth] = useState(now.getMonth());
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportView, setReportView] = useState("weekly");
  const [reportDate, setReportDate] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [reportWeek, setReportWeek] = useState(getWeekNumber(now));
  const [reportWeekYear, setReportWeekYear] = useState(now.getFullYear());
  const [reportAnnualYear, setReportAnnualYear] = useState(now.getFullYear());

  // Timer state
  const [timerStatus, setTimerStatus] = useState("stopped"); // "stopped" | "running" | "paused"
  const [timerStartTime, setTimerStartTime] = useState(null); // Date when timer started
  const [timerStartStr, setTimerStartStr] = useState(""); // HH:MM when started (snapped to 15min)
  const [timerElapsed, setTimerElapsed] = useState(0); // ms elapsed (not counting pauses)
  const [timerPauseStart, setTimerPauseStart] = useState(null); // when current pause began
  const [timerTotalPaused, setTimerTotalPaused] = useState(0); // total ms spent paused
  const [timerCustomer, setTimerCustomer] = useState("");
  const [timerProject, setTimerProject] = useState("");
  const [timerWorkOrder, setTimerWorkOrder] = useState("");
  const [timerActivity, setTimerActivity] = useState("");
  const [timerTags, setTimerTags] = useState([]);
  const [timerNote, setTimerNote] = useState("");
  const [timerEntryId, setTimerEntryId] = useState(null); // linked calendar entry id
  const timerRef = useRef(null);

  // Warn on close if timer running
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (timerStatus === "running" || timerStatus === "paused") {
        e.preventDefault(); e.returnValue = "Timer is still running. Are you sure you want to leave?";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [timerStatus]);

  // ═══ STORAGE ═══
  // Re-runs whenever the effective profile changes (including initial mount and
  // user-triggered profile switches). Cancellation flag guards against a later
  // load overwriting an in-flight one's setState calls.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setTasksLoaded(false);
      try {
        const [dr, cr, sr] = await Promise.all([
          storageAdapter.get(DATA_KEY).catch(() => null),
          storageAdapter.get(CONFIG_KEY).catch(() => null),
          storageAdapter.get(SETTINGS_KEY).catch(() => null)
        ]);
        if (cancelled) return;
        let loadedData = {};
        // In Supabase mode, load time entries from the entries table
        if (supabaseConfigured && userId !== 'local') {
          const supaData = await loadAllData(userId, effectiveProfileId);
          if (cancelled) return;
          if (supaData) loadedData = supaData;
        } else if (dr?.value) {
          loadedData = JSON.parse(dr.value);
        }
        if (cr?.value) {
          const loaded = JSON.parse(cr.value);
          setConfig(prev => ({ ...prev, ...loaded, tags: loaded.tags || [], activityTemplates: loaded.activityTemplates || [], favouriteActivities: loaded.favouriteActivities || [], roles: loaded.roles || [], favouriteRoles: loaded.favouriteRoles || [], favouriteTags: loaded.favouriteTags || [], billRates: loaded.billRates || [], favouriteBillRates: loaded.favouriteBillRates || [], tagCategories: loaded.tagCategories || {}, bankHolidayRegion: loaded.bankHolidayRegion || "", customHolidays: loaded.customHolidays || {} }));
        }
        let loadedDefs = { customer: "", project: "", workOrder: "", activity: "", role: "" };
        if (sr?.value) { const s = JSON.parse(sr.value); if (s.standardHours) setStandardHours(s.standardHours); if (s.defaults) { loadedDefs = { ...loadedDefs, ...s.defaults }; setDefaults(prev => ({ ...prev, ...s.defaults })); } }

        // Seed data for Jan/Feb/Mar 2026 on truly fresh installs only. Skip for
        // newly-created profiles and for profile switches (which both have
        // empty data but should stay empty).
        const seedMarkerKey = `wht-v3-seeded-${userId || 'local'}`;
        const alreadySeeded = localStorage.getItem(seedMarkerKey) === '1';
        const isDefaultScope = !effectiveProfileId || effectiveProfileId === 'default';
        const needsSeed = !loadedData["2026-W2"] && !alreadySeeded && isDefaultScope;
        if (needsSeed) {
          function seedEntry(start, end, extra) {
            return { id: uid(), start, end, customer: loadedDefs.customer || "", project: loadedDefs.project || "", workOrder: loadedDefs.workOrder || "", activity: loadedDefs.activity || "", role: loadedDefs.role || "", tags: [], note: "", ...extra };
          }
          function addToWeek(data, date, entry) {
            const wn = getWeekNumber(date);
            const yr = date.getMonth() === 0 && wn > 50 ? date.getFullYear() - 1 : date.getMonth() === 11 && wn < 5 ? date.getFullYear() + 1 : date.getFullYear();
            const key = `${yr}-W${wn}`;
            if (!data[key]) data[key] = [[], [], [], [], [], [], []];
            const dayIdx = (date.getDay() + 6) % 7;
            data[key][dayIdx].push(entry);
          }
          function getWeekdays(year, month) {
            const days = [];
            const d = new Date(year, month, 1);
            while (d.getMonth() === month) {
              if (d.getDay() >= 1 && d.getDay() <= 5) days.push(new Date(d));
              d.setDate(d.getDate() + 1);
            }
            return days;
          }

          const seed = { ...loadedData };

          // January 2026: 181h work + 15h annual leave (22 weekdays)
          const janDays = getWeekdays(2026, 0);
          // First 2 weekdays = annual leave (7.5h each = 15h)
          addToWeek(seed, janDays[0], seedEntry("09:00", "16:30", { activity: "Annual Leave", note: "Annual Leave" }));
          addToWeek(seed, janDays[1], seedEntry("09:00", "16:30", { activity: "Annual Leave", note: "Annual Leave" }));
          // Remaining 20 days: 19 × 9h + 1 × 10h = 181h
          for (let i = 2; i < janDays.length; i++) {
            if (i === 2) {
              addToWeek(seed, janDays[i], seedEntry("09:00", "19:00"));
            } else {
              addToWeek(seed, janDays[i], seedEntry("09:00", "18:00"));
            }
          }

          // February 2026: 235.25h (20 weekdays)
          // 19 × 11.75h + 1 × 12h = 235.25h
          const febDays = getWeekdays(2026, 1);
          for (let i = 0; i < febDays.length; i++) {
            if (i === 0) {
              addToWeek(seed, febDays[i], seedEntry("07:00", "19:00"));
            } else {
              addToWeek(seed, febDays[i], seedEntry("07:00", "18:45"));
            }
          }

          // March 2026: 240.25h (22 weekdays)
          // 21 × 11h + 1 × 9.25h = 240.25h
          const marDays = getWeekdays(2026, 2);
          for (let i = 0; i < marDays.length; i++) {
            if (i === marDays.length - 1) {
              addToWeek(seed, marDays[i], seedEntry("08:00", "17:15"));
            } else {
              addToWeek(seed, marDays[i], seedEntry("08:00", "19:00"));
            }
          }

          loadedData = seed;
          localStorage.setItem(seedMarkerKey, '1');
        }

        if (cancelled) return;
        setAllData(loadedData);

        // Restore timer state
        try {
          const tr = await storageAdapter.get(TIMER_KEY).catch(() => null);
          if (tr?.value) {
            const t = JSON.parse(tr.value);
            if (t.status && t.status !== "stopped" && t.startTime) {
              setTimerStatus(t.status);
              setTimerStartTime(new Date(t.startTime));
              setTimerStartStr(t.startStr || "");
              setTimerTotalPaused(t.totalPaused || 0);
              setTimerPauseStart(t.pauseStart ? t.pauseStart : null);
              setTimerNote(t.note || "");
              setTimerActivity(t.activity || "");
              setTimerCustomer(t.customer || "");
              setTimerProject(t.project || "");
              setTimerWorkOrder(t.workOrder || "");
              setTimerTags(t.tags || []);
              setTimerElapsed(Date.now() - new Date(t.startTime).getTime() - (t.totalPaused || 0));
            }
          }
        } catch (e) {}

        // Load tasks
        try {
          if (supabaseConfigured && userId !== 'local') {
            const supaTasks = await loadTasks(userId, effectiveProfileId);
            if (cancelled) return;
            // Always assign (empty array is valid for a new profile). This
            // also ensures the previous profile's tasks aren't left on screen
            // during a profile switch.
            setTasks(supaTasks || []);
          } else {
            const tk = await storageAdapter.get(TASKS_KEY).catch(() => null);
            if (cancelled) return;
            if (tk?.value) setTasks(JSON.parse(tk.value));
            else setTasks([]);
          }
          if (cancelled) return;
          setTasksLoaded(true);
        } catch (e) {
          console.error("Failed to load tasks:", e);
          setTasksLoadError(e?.message || "Failed to load tasks");
          // Deliberately do NOT set tasksLoaded — auto-save stays disabled
          // to prevent overwriting the database with an empty array.
        }

      } catch (e) { console.log("Fresh start"); }
      if (cancelled) return;
      setLastSaved(new Date());
      setLoading(false);
      setProfileSwitching(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, effectiveProfileId]);

  const save = useCallback(async (data, cfg, hrs, defs) => {
    try {
      // Guard: don't save empty config over existing data
      const hasConfig = (cfg.customers && cfg.customers.length > 0) || (cfg.projects && cfg.projects.length > 0) ||
        (cfg.workOrders && cfg.workOrders.length > 0) || (cfg.tags && cfg.tags.length > 0) ||
        (cfg.roles && cfg.roles.length > 0) || (cfg.billRates && cfg.billRates.length > 0);
      const hasData = Object.keys(data).length > 0;
      if (!hasConfig && !hasData) return; // Don't wipe storage with empty state

      if (supabaseConfigured && userId !== 'local') {
        await Promise.all([
          saveAllData(userId, data, effectiveProfileId),
          storageAdapter.set(CONFIG_KEY, JSON.stringify(cfg)),
          storageAdapter.set(SETTINGS_KEY, JSON.stringify({ standardHours: hrs, defaults: defs }))
        ]);
      } else {
        await Promise.all([
          storageAdapter.set(DATA_KEY, JSON.stringify(data)),
          storageAdapter.set(CONFIG_KEY, JSON.stringify(cfg)),
          storageAdapter.set(SETTINGS_KEY, JSON.stringify({ standardHours: hrs, defaults: defs }))
        ]);
      }
      setLastSaved(new Date());
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (e) { setSaveStatus("error"); setTimeout(() => setSaveStatus(""), 3000); }
  }, [userId, storageAdapter, effectiveProfileId]);

  const [showExport, setShowExport] = useState(null); // null or JSON string
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [showTimesheetExport, setShowTimesheetExport] = useState(null);

  function exportData() {
    try {
      const json = JSON.stringify({ data: allData, config, settings: { standardHours, defaults }, tasks }, null, 2);
      setShowExport(json);
    } catch (e) { setSaveStatus("export error"); }
  }

  function exportTimesheet() {
    try {
      const rows = [["Date", "Day", "Start", "End", "Hours", "Note", "Activity", "Work Order", "Project", "Customer", "Role", "Bill Rate", "Tags"].join(",")];
      const sortedKeys = Object.keys(allData).sort();
      sortedKeys.forEach(key => {
        const parts = key.split("-W");
        if (parts.length !== 2) return;
        const y = parseInt(parts[0], 10), w = parseInt(parts[1], 10);
        if (isNaN(y) || isNaN(w)) return;
        const mon = getMondayOfWeek(w, y);
        const days = allData[key] || [];
        days.forEach((day, di) => {
          const d = new Date(mon); d.setDate(d.getDate() + di);
          const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,"0")}-${d.getDate().toString().padStart(2,"0")}`;
          const dayName = DAYS[di];
          (day || []).forEach(ent => {
            const s = parseTime(ent.start), e = parseTime(ent.end);
            const hrs = s !== null && e !== null ? fmtH(Math.max(0, e - s)) : "0";
            const esc = v => `"${(v || "").replace(/"/g, '""')}"`;
            rows.push([dateStr, dayName, ent.start || "", ent.end || "", hrs, esc(ent.note), esc(ent.activity), esc(ent.workOrder), esc(ent.project), esc(ent.customer), esc(ent.role), esc(ent.billRate), esc((ent.tags || []).join("; "))].join(","));
          });
        });
      });
      setShowTimesheetExport(rows.join("\n"));
    } catch (e) { setSaveStatus("export error"); }
  }

  function doImport() {
    try {
      const imported = JSON.parse(importText);
      if (imported.data) setAllData(imported.data);
      if (imported.config) setConfig(prev => ({ ...prev, ...imported.config }));
      if (imported.settings) {
        if (imported.settings.standardHours) setStandardHours(imported.settings.standardHours);
        if (imported.settings.defaults) setDefaults(prev => ({ ...prev, ...imported.settings.defaults }));
      }
      if (imported.tasks) setTasks(imported.tasks);
      setShowImport(false); setImportText("");
      setSaveStatus("imported"); setTimeout(() => setSaveStatus(""), 3000);
    } catch (err) { setSaveStatus("import error — invalid JSON"); setTimeout(() => setSaveStatus(""), 3000); }
  }

  async function refreshFromStorage() {
    setSaveStatus("refreshing...");
    try {
      if (supabaseConfigured && userId !== 'local') {
        const [supaData, cr, sr] = await Promise.all([
          loadAllData(userId, effectiveProfileId),
          storageAdapter.get(CONFIG_KEY).catch(() => null),
          storageAdapter.get(SETTINGS_KEY).catch(() => null)
        ]);
        if (supaData) setAllData(supaData);
        if (cr?.value) {
          const loaded = JSON.parse(cr.value);
          setConfig(prev => ({ ...prev, ...loaded, tags: loaded.tags || [], activityTemplates: loaded.activityTemplates || [], favouriteActivities: loaded.favouriteActivities || [], roles: loaded.roles || [], favouriteRoles: loaded.favouriteRoles || [], favouriteTags: loaded.favouriteTags || [], billRates: loaded.billRates || [], favouriteBillRates: loaded.favouriteBillRates || [], tagCategories: loaded.tagCategories || {}, bankHolidayRegion: loaded.bankHolidayRegion || "", customHolidays: loaded.customHolidays || {} }));
        }
        if (sr?.value) {
          const s = JSON.parse(sr.value);
          if (s.standardHours) setStandardHours(s.standardHours);
          if (s.defaults) setDefaults(prev => ({ ...prev, ...s.defaults }));
        }
        const supaTasks = await loadTasks(userId, effectiveProfileId);
        if (supaTasks) setTasks(supaTasks);
      } else {
        const [dr, cr, sr] = await Promise.all([
          storageAdapter.get(DATA_KEY).catch(() => null),
          storageAdapter.get(CONFIG_KEY).catch(() => null),
          storageAdapter.get(SETTINGS_KEY).catch(() => null)
        ]);
        if (dr?.value) setAllData(JSON.parse(dr.value));
        if (cr?.value) {
          const loaded = JSON.parse(cr.value);
          setConfig(prev => ({ ...prev, ...loaded, tags: loaded.tags || [], activityTemplates: loaded.activityTemplates || [], favouriteActivities: loaded.favouriteActivities || [], roles: loaded.roles || [], favouriteRoles: loaded.favouriteRoles || [], favouriteTags: loaded.favouriteTags || [], billRates: loaded.billRates || [], favouriteBillRates: loaded.favouriteBillRates || [], tagCategories: loaded.tagCategories || {}, bankHolidayRegion: loaded.bankHolidayRegion || "", customHolidays: loaded.customHolidays || {} }));
        }
        if (sr?.value) {
          const s = JSON.parse(sr.value);
          if (s.standardHours) setStandardHours(s.standardHours);
          if (s.defaults) setDefaults(prev => ({ ...prev, ...s.defaults }));
        }
        try {
          const tk = await storageAdapter.get(TASKS_KEY).catch(() => null);
          if (tk?.value) setTasks(JSON.parse(tk.value));
        } catch (e) {}
      }
      setLastSaved(new Date());
      setSaveStatus("refreshed"); setTimeout(() => setSaveStatus(""), 2000);
    } catch (e) { setSaveStatus("refresh failed"); setTimeout(() => setSaveStatus(""), 3000); }
  }

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => save(allData, config, standardHours, defaults), 600);
    return () => clearTimeout(t);
  }, [allData, config, standardHours, defaults, loading, save]);

  // ═══ PROFILES ═══
  // Probe the profiles table on mount/user change. If the migration hasn't
  // been run, stay in pre-profiles mode (no filtering). Otherwise hydrate the
  // profile list and restore the last active profile from localStorage.
  useEffect(() => {
    if (!userId || userId === "local" || !supabaseConfigured) {
      setProfilesAvailable(false);
      setProfiles([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await ensureDefaultProfile(userId);
        if (cancelled) return;
        if (list === null) {
          setProfilesAvailable(false);
          setProfiles([]);
          return;
        }
        setProfilesAvailable(true);
        setProfiles(list);
        const storedId = localStorage.getItem(`wht-v3-active-profile-${userId}`);
        const valid = storedId && list.some(p => p.id === storedId) ? storedId : "default";
        if (valid !== activeProfileId) setActiveProfileId(valid);
      } catch (err) {
        console.error("Profile probe failed:", err);
        if (!cancelled) setProfilesAvailable(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profilesVersion]);

  // Persist the active profile id per user so reloads stay on the same one.
  useEffect(() => {
    if (!profilesAvailable || !userId || userId === "local") return;
    localStorage.setItem(`wht-v3-active-profile-${userId}`, activeProfileId);
  }, [activeProfileId, userId, profilesAvailable]);

  const switchProfile = useCallback((nextId) => {
    if (!profilesAvailable || nextId === activeProfileId) return;
    // Flush any pending saves to the CURRENT profile first, so nothing lands
    // in the wrong bucket when the storage adapter flips.
    save(allData, config, standardHours, defaults);
    setProfileSwitching(true);
    setActiveProfileId(nextId);
  }, [profilesAvailable, activeProfileId, save, allData, config, standardHours, defaults]);

  async function addProfile(name) {
    if (!profilesAvailable) return;
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      await createProfile(userId, id, trimmed);
      setProfilesVersion(v => v + 1);
      // Switch to the new profile immediately after creation
      setTimeout(() => switchProfile(id), 0);
    } catch (err) {
      if (err instanceof ProfilesTableMissingError) {
        setProfilesAvailable(false);
      } else {
        console.error("createProfile failed:", err);
        alert("Could not create profile: " + (err?.message || "Unknown error"));
      }
    }
  }

  async function renameProfileAction(id, newName) {
    const trimmed = (newName || "").trim();
    if (!trimmed) return;
    try {
      await renameProfile(userId, id, trimmed);
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, name: trimmed } : p));
    } catch (err) {
      console.error("renameProfile failed:", err);
      alert("Could not rename profile: " + (err?.message || "Unknown error"));
    }
  }

  async function removeProfile(id) {
    if (id === "default") {
      alert("The Default profile cannot be deleted.");
      return;
    }
    const p = profiles.find(x => x.id === id);
    if (!window.confirm(`Delete profile "${p?.name || id}" and all its data? This cannot be undone.`)) return;
    try {
      // If we're deleting the active profile, switch to default first so the
      // load effect doesn't race the delete.
      if (id === activeProfileId) {
        setActiveProfileId("default");
      }
      await deleteProfile(userId, id);
      setProfilesVersion(v => v + 1);
    } catch (err) {
      console.error("deleteProfile failed:", err);
      alert("Could not delete profile: " + (err?.message || "Unknown error"));
    }
  }

  // ── Organization probe: detect if user is in an org, load org config ──
  useEffect(() => {
    if (!userId || userId === "local" || !supabaseConfigured) {
      setOrg(null);
      setOrgConfig(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const membership = await getMyOrg(userId);
        if (cancelled) return;
        if (!membership) { setOrg(null); setOrgConfig(null); return; }
        setOrg(membership);
        const oid = membership.organizations?.id;
        if (oid) {
          const [members, oc] = await Promise.all([
            getOrgMembers(oid),
            loadOrgConfig(oid),
          ]);
          if (cancelled) return;
          setOrgMembers(members || []);
          setOrgConfig(oc || {});
        }
      } catch (err) {
        console.error("Org probe failed:", err);
        if (!cancelled) { setOrg(null); setOrgConfig(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [userId, orgVersion]);

  // ── Org config auto-save (admin only) ──
  useEffect(() => {
    if (!orgConfig || !orgId || !isOrgAdmin) return;
    const timer = setTimeout(() => {
      saveOrgConfig(orgId, orgConfig).catch(err => console.error("saveOrgConfig failed:", err));
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgConfig]);

  // ── Portfolio probe ──
  useEffect(() => {
    if (!userId || userId === "local" || !supabaseConfigured || !orgId) {
      setOrgPortfolios([]);
      setMyPortfolioMemberships([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [portfolios, myPms] = await Promise.all([
          listOrgPortfolios(orgId),
          getMyPortfolios(userId),
        ]);
        if (cancelled) return;
        setOrgPortfolios(portfolios || []);
        setMyPortfolioMemberships(myPms || []);
      } catch {
        if (!cancelled) { setOrgPortfolios([]); setMyPortfolioMemberships([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [userId, orgId, orgVersion]);

  // ── Organization action handlers ──
  async function handleCreateOrg() {
    const name = window.prompt("Organization name:");
    if (!name?.trim()) return;
    try {
      const result = await createOrg(name.trim());
      if (result?.id && activeProfileId) {
        await linkProfileToOrg(userId, activeProfileId, result.id);
        setProfilesVersion(v => v + 1);
      }
      setOrgVersion(v => v + 1);
    } catch (err) {
      alert("Could not create organization: " + (err?.message || "Unknown error"));
    }
  }

  async function handleJoinOrg() {
    const code = window.prompt("Paste your organization invite code:");
    if (!code?.trim()) return;
    try {
      const result = await joinOrg(code.trim());
      if (result?.org_id && activeProfileId) {
        await linkProfileToOrg(userId, activeProfileId, result.org_id);
        setProfilesVersion(v => v + 1);
      }
      setOrgVersion(v => v + 1);
    } catch (err) {
      alert("Could not join organization: " + (err?.message || "Unknown error"));
    }
  }

  async function handleLeaveOrg() {
    if (!orgId) return;
    if (!window.confirm("Leave this organization? Your profiles will be unlinked.")) return;
    try {
      await leaveOrg(orgId, userId);
      setProfilesVersion(v => v + 1);
      setOrgVersion(v => v + 1);
    } catch (err) {
      alert("Could not leave organization: " + (err?.message || "Unknown error"));
    }
  }

  async function handleRegenerateInvite() {
    if (!orgId) return;
    if (!window.confirm("Generate a new invite code? The old code will stop working.")) return;
    try {
      const code = await regenerateInviteCode(orgId);
      setOrg(prev => prev ? { ...prev, organizations: { ...prev.organizations, invite_code: code } } : prev);
    } catch (err) {
      alert("Could not regenerate invite code: " + (err?.message || ""));
    }
  }

  async function handleToggleAdmin(targetUserId) {
    if (!orgId) return;
    const member = orgMembers.find(m => m.user_id === targetUserId);
    if (!member) return;
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    try {
      await updateMemberRole(orgId, targetUserId, newRole);
      setOrgMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, role: newRole } : m));
    } catch (err) {
      alert("Could not update role: " + (err?.message || ""));
    }
  }

  async function handleRemoveMember(targetUserId) {
    if (!orgId) return;
    const member = orgMembers.find(m => m.user_id === targetUserId);
    if (!window.confirm(`Remove ${member?.display_name || "this member"} from the organization?`)) return;
    try {
      await removeMember(orgId, targetUserId);
      setOrgMembers(prev => prev.filter(m => m.user_id !== targetUserId));
    } catch (err) {
      alert("Could not remove member: " + (err?.message || ""));
    }
  }

  async function handleLinkProfile(profileId) {
    if (!orgId) return;
    try {
      await linkProfileToOrg(userId, profileId, orgId);
      setProfilesVersion(v => v + 1);
    } catch (err) {
      alert("Could not link profile: " + (err?.message || ""));
    }
  }

  async function handleUnlinkProfile(profileId) {
    try {
      await unlinkProfileFromOrg(userId, profileId);
      setProfilesVersion(v => v + 1);
    } catch (err) {
      alert("Could not unlink profile: " + (err?.message || ""));
    }
  }

  // ── Portfolio action handlers ──
  async function handleCreatePortfolio() {
    if (!orgId) return;
    const name = window.prompt("Portfolio name:");
    if (!name?.trim()) return;
    try {
      await createPortfolio(orgId, name.trim());
      setOrgVersion(v => v + 1);
    } catch (err) {
      alert("Could not create portfolio: " + (err?.message || ""));
    }
  }

  async function handleDeletePortfolio(id) {
    const p = orgPortfolios.find(x => x.id === id);
    if (!window.confirm(`Delete portfolio "${p?.name || id}"?`)) return;
    try {
      await deletePortfolio(id);
      setOrgVersion(v => v + 1);
      if (activePortfolioId === id) setActivePortfolioId(null);
    } catch (err) {
      alert("Could not delete portfolio: " + (err?.message || ""));
    }
  }

  async function handleRenamePortfolio(id) {
    const p = orgPortfolios.find(x => x.id === id);
    const name = window.prompt("New name:", p?.name || "");
    if (!name?.trim()) return;
    try {
      await renamePortfolio(id, name.trim());
      setOrgVersion(v => v + 1);
    } catch (err) {
      alert("Could not rename portfolio: " + (err?.message || ""));
    }
  }

  async function handleAddPortfolioMember(portfolioId, targetUserId, role = 'member') {
    try {
      await addPortfolioMember(portfolioId, targetUserId, role);
      setOrgVersion(v => v + 1);
    } catch (err) {
      alert("Could not add member: " + (err?.message || ""));
    }
  }

  async function handleRemovePortfolioMember(portfolioId, targetUserId) {
    try {
      await removePortfolioMember(portfolioId, targetUserId);
      setOrgVersion(v => v + 1);
    } catch (err) {
      alert("Could not remove member: " + (err?.message || ""));
    }
  }

  async function handleTogglePortfolioManager(portfolioId, targetUserId) {
    const members = portfolioMemberMap[portfolioId] || [];
    const member = members.find(m => m.user_id === targetUserId);
    if (!member) return;
    const newRole = member.role === 'manager' ? 'member' : 'manager';
    try {
      await updatePortfolioMemberRole(portfolioId, targetUserId, newRole);
      setOrgVersion(v => v + 1);
    } catch (err) {
      alert("Could not update role: " + (err?.message || ""));
    }
  }

  // ═══ WEEK DATA ═══
  const weekKey = `${currentYear}-W${currentWeek}`;

  // Load portfolio members when portfolios change
  useEffect(() => {
    if (orgPortfolios.length === 0) { setPortfolioMemberMap({}); return; }
    let cancelled = false;
    (async () => {
      const map = {};
      for (const p of orgPortfolios) {
        try {
          map[p.id] = await getPortfolioMembers(p.id);
        } catch { map[p.id] = []; }
      }
      if (!cancelled) setPortfolioMemberMap(map);
    })();
    return () => { cancelled = true; };
  }, [orgPortfolios]);

  // Load portfolio view data when manager selects a portfolio
  useEffect(() => {
    if (!activePortfolioId || !isPortfolioManager) return;
    const members = portfolioMemberMap[activePortfolioId] || [];
    const memberIds = members.map(m => m.user_id);
    if (memberIds.length === 0) { setPortfolioEntries([]); setPortfolioTasks([]); return; }
    let cancelled = false;
    setPortfolioLoading(true);
    const wk = portfolioWeekKey || weekKey;
    (async () => {
      try {
        const [entries, tasks] = await Promise.all([
          loadPortfolioEntries(memberIds, wk),
          loadPortfolioTasks(memberIds),
        ]);
        if (cancelled) return;
        setPortfolioEntries(entries || []);
        setPortfolioTasks(tasks || []);
      } catch (err) {
        console.error("Portfolio load failed:", err);
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activePortfolioId, portfolioMemberMap, portfolioWeekKey, weekKey, isPortfolioManager]);
  const weekData = allData[weekKey] || [[], [], [], [], [], [], []];

  const monday = getMondayOfWeek(currentWeek, currentYear);
  const weekDates = DAYS.map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });
  const isToday = (d) => d.toDateString() === now.toDateString();

  function setWeekData(newWeek) {
    setAllData(prev => ({ ...prev, [weekKey]: newWeek }));
  }

  // ═══ RECURRING ENTRIES ═══
  // Auto-generate recurring entries for the current week from past weeks' recurring entries
  useEffect(() => {
    if (loading) return;
    const targetMon = getMondayOfWeek(currentWeek, currentYear);
    targetMon.setHours(0, 0, 0, 0);
    const targetMonTime = targetMon.getTime();
    const wd = allData[weekKey] || [[], [], [], [], [], [], []];

    // Collect recurring sources from ALL weeks (we'll filter by date below)
    const sources = [];
    Object.entries(allData).forEach(([key, days]) => {
      const parts = key.split("-W");
      if (parts.length !== 2) return;
      const y = parseInt(parts[0], 10);
      const w = parseInt(parts[1], 10);
      if (isNaN(y) || isNaN(w) || w < 1 || w > 53) return;

      const srcMon = getMondayOfWeek(w, y);
      srcMon.setHours(0, 0, 0, 0);
      const srcMonTime = srcMon.getTime();

      // Skip future weeks — only use current or earlier weeks as sources
      if (srcMonTime > targetMonTime) return;

      const isSameWeek = srcMonTime === targetMonTime;

      (days || []).forEach((day, di) => {
        (day || []).forEach(ent => {
          if (!ent.recurring || !ent.recurFrequency || !ent.recurId || !ent.recurApplied) return;
          sources.push({
            ent,
            srcMonTime,
            srcDayIdx: di,
            isSameWeek,
            srcDateOfMonth: new Date(srcMonTime + di * 86400000).getDate(),
            weeksBetween: Math.round((targetMonTime - srcMonTime) / (7 * 86400000))
          });
        });
      });
    });

    if (sources.length === 0) return;

    // What recurId+dayIdx combos already exist in the current week?
    const existing = new Set();
    wd.forEach(day => day.forEach(e => {
      if (e.recurId != null && e.recurId !== "") {
        existing.add(e.recurId + "|" + (e.recurDayIdx ?? ""));
      }
    }));

    let changed = false;
    const newWd = wd.map(d => [...d]);

    sources.forEach(({ ent, srcDayIdx, isSameWeek, srcDateOfMonth, weeksBetween }) => {
      const freq = ent.recurFrequency;

      // Determine which days of the target week this entry should appear on
      let targetDayIndices = [];

      if (freq === "daily") {
        const days = ent.recurDays && ent.recurDays.length > 0 ? ent.recurDays : [0, 1, 2, 3, 4];
        targetDayIndices = days.filter(d => d >= 0 && d <= 4);
      } else if (freq === "weekly") {
        if (!isSameWeek) targetDayIndices = [srcDayIdx];
      } else if (freq === "biweekly") {
        if (weeksBetween > 0 && weeksBetween % 2 === 0) {
          targetDayIndices = [srcDayIdx];
        }
      } else if (freq === "monthly") {
        for (let di = 0; di < 7; di++) {
          const d = new Date(targetMonTime + di * 86400000);
          if (d.getDate() === srcDateOfMonth) targetDayIndices.push(di);
        }
      }

      // For same-week sources, only generate for days AFTER the source day
      if (isSameWeek) {
        targetDayIndices = targetDayIndices.filter(di => di > srcDayIdx);
      }

      targetDayIndices.forEach(di => {
        // Check recurUntil
        if (ent.recurUntil) {
          const targetDate = new Date(targetMonTime + di * 86400000);
          if (targetDate > new Date(ent.recurUntil + "T23:59:59")) return;
        }

        // Already exists?
        const rkey = ent.recurId + "|" + di;
        if (existing.has(rkey)) return;

        // Check overlap with existing entries on this day
        const s = parseTime(ent.start), e = parseTime(ent.end);
        if (s === null || e === null) return;
        const overlaps = newWd[di].some(x => {
          const os = parseTime(x.start), oe = parseTime(x.end);
          return os !== null && oe !== null && s < oe && e > os;
        });
        if (overlaps) return;

        existing.add(rkey);
        newWd[di] = [...newWd[di], {
          id: uid(),
          start: ent.start, end: ent.end,
          customer: ent.customer || "", project: ent.project || "", workOrder: ent.workOrder || "",
          activity: ent.activity || "", role: ent.role || "", billRate: ent.billRate || "",
          tags: ent.tags || [], note: ent.note || "",
          recurring: true, recurFrequency: freq, recurId: ent.recurId, recurDayIdx: di,
          recurUntil: ent.recurUntil || "", recurDays: ent.recurDays || [], recurApplied: true
        }];
        changed = true;
      });
    });

    if (changed) setAllData(prev => ({ ...prev, [weekKey]: newWd }));
  }, [currentWeek, currentYear, loading, allData, weekKey]);

  function updateEntry(entryId, field, value) {
    setAllData(prev => {
      const wd = prev[weekKey] || [[], [], [], [], [], [], []];
      if (field === "start" || field === "end") {
        for (const day of wd) {
          const ent = day.find(e => e.id === entryId);
          if (ent) {
            const newStart = parseTime(field === "start" ? value : ent.start);
            const newEnd = parseTime(field === "end" ? value : ent.end);
            if (newStart === null || newEnd === null || newStart >= newEnd) return prev;
            const overlaps = day.some(other => {
              if (other.id === entryId) return false;
              const os = parseTime(other.start), oe = parseTime(other.end);
              if (os === null || oe === null) return false;
              return newStart < oe && newEnd > os;
            });
            if (overlaps) return prev;
            break;
          }
        }
      }
      const nw = wd.map(day => day.map(ent => ent.id === entryId ? { ...ent, [field]: value } : ent));
      return { ...prev, [weekKey]: nw };
    });
  }

  // Update multiple fields on an entry at once (avoids stale state issues)
  function updateEntryFields(entryId, fields) {
    setAllData(prev => {
      const wd = prev[weekKey] || [[], [], [], [], [], [], []];
      const nw = wd.map(day => day.map(ent => ent.id === entryId ? { ...ent, ...fields } : ent));
      return { ...prev, [weekKey]: nw };
    });
  }

  function addEntry(dayIdx, start, end) {
    const s = parseTime(start), e = parseTime(end);
    if (s === null || e === null || s >= e) return;
    const dayEntries = weekData[dayIdx] || [];
    const overlaps = dayEntries.some(ent => {
      const os = parseTime(ent.start), oe = parseTime(ent.end);
      if (os === null || oe === null) return false;
      return s < oe && e > os;
    });
    if (overlaps) return;
    const nw = [...weekData];
    let newEntry;
    if (schedulingTask) {
      const t = schedulingTask;
      const dur = (t.duration || 60) / 60; // hours
      const adjEnd = timeToStr(Math.min(s + dur, 24));
      newEntry = {
        id: uid(), start, end: adjEnd,
        customer: t.customer || defaults.customer || "", project: t.project || defaults.project || "",
        workOrder: t.workOrder || defaults.workOrder || "", activity: t.activity || defaults.activity || "",
        role: defaults.role || "", billRate: defaults.billRate || "",
        tags: t.tags || [], note: t.title || "", taskId: t.id
      };
      updateTask(t.id, { scheduledStart: start, scheduledEnd: adjEnd, scheduledDate: dateStr(weekDates[dayIdx]) });
      setSchedulingTask(null);
    } else {
      newEntry = { id: uid(), start, end, customer: defaults.customer || "", project: defaults.project || "", workOrder: defaults.workOrder || "", activity: defaults.activity || "", role: defaults.role || "", billRate: defaults.billRate || "", tags: [], note: "" };
    }
    nw[dayIdx] = [...(nw[dayIdx] || []), newEntry];
    setWeekData(nw);
    setSelectedEntryId(newEntry.id);
    newEntryRef.current = newEntry.id;
  }

  function deleteEntry(entryId) {
    const entry = weekData.flat().find(e => e.id === entryId);
    if (entry) {
      const dayIdx = weekData.findIndex(day => day.some(e => e.id === entryId));
      pushUndo("deleteEntry", { entry: { ...entry }, dayIdx });
      if (entry.taskId) updateTask(entry.taskId, { scheduledStart: "", scheduledEnd: "", scheduledDate: "" });
    }
    const nw = weekData.map(day => day.filter(e => e.id !== entryId));
    setWeekData(nw);
    if (selectedEntryId === entryId) setSelectedEntryId(null);
  }

  function copyEntry(entryId) {
    const ent = weekData.flat().find(e => e.id === entryId);
    if (!ent) return;
    setCopiedEntry({ ...ent });
  }

  function pasteEntry() {
    if (!copiedEntry) return;
    const s = parseTime(copiedEntry.start), e = parseTime(copiedEntry.end);
    if (s === null || e === null) return;
    const duration = e - s;
    const existing = weekData[entryDayIndex] || [];

    function fits(start) {
      const end = start + duration;
      if (end > 24) return false;
      return !existing.some(ent => {
        const os = parseTime(ent.start), oe = parseTime(ent.end);
        return os !== null && oe !== null && start < oe && end > os;
      });
    }

    // Find the latest end time of existing entries
    let latestEnd = 0;
    existing.forEach(ent => {
      const oe = parseTime(ent.end);
      if (oe !== null && oe > latestEnd) latestEnd = oe;
    });

    // Try after the latest entry first, snapped to 15 min
    let pasteStart = Math.ceil(latestEnd * 4) / 4;
    if (!fits(pasteStart)) {
      // Fall back to scanning from midnight
      pasteStart = -1;
      for (let t = 0; t < 24; t += 0.25) {
        if (fits(t)) { pasteStart = t; break; }
      }
      if (pasteStart < 0) return;
    }

    const newEntry = {
      id: uid(),
      start: timeToStr(pasteStart), end: timeToStr(pasteStart + duration),
      customer: copiedEntry.customer || "", project: copiedEntry.project || "",
      workOrder: copiedEntry.workOrder || "", activity: copiedEntry.activity || "",
      role: copiedEntry.role || "", billRate: copiedEntry.billRate || "",
      tags: copiedEntry.tags || [], note: copiedEntry.note || ""
    };
    const nw = weekData.map((day, di) => di === entryDayIndex ? [...day, newEntry] : day);
    setWeekData(nw);
    setSelectedEntryId(newEntry.id);
  }

  // Paste copied fields into the currently selected entry (keeps time)
  function pasteIntoSelected() {
    if (!copiedEntry || !selectedEntryId) return;
    updateEntryFields(selectedEntryId, {
      note: copiedEntry.note || "",
      activity: copiedEntry.activity || "",
      workOrder: copiedEntry.workOrder || "",
      project: copiedEntry.project || "",
      customer: copiedEntry.customer || "",
      billRate: copiedEntry.billRate || "",
      tags: copiedEntry.tags || []
    });
  }

  // Paste copied fields into the timer
  function pasteIntoTimer() {
    if (!copiedEntry) return;
    setTimerNote(copiedEntry.note || "");
    setTimerActivity(copiedEntry.activity || "");
    setTimerWorkOrder(copiedEntry.workOrder || "");
    setTimerProject(copiedEntry.project || "");
    setTimerCustomer(copiedEntry.customer || "");
    setTimerTags(copiedEntry.tags || []);
  }

  // Delete all future occurrences of a recurring entry
  function deleteAllFuture(entryId) {
    const entry = weekData.flat().find(e => e.id === entryId);
    if (!entry || !entry.recurId) return;
    const rid = entry.recurId;
    const currentMon = getMondayOfWeek(currentWeek, currentYear);
    currentMon.setHours(0, 0, 0, 0);

    setAllData(prev => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, days]) => {
        const [y, w] = key.split("-W").map(Number);
        if (!y || !w) return;
        const mon = getMondayOfWeek(w, y);
        mon.setHours(0, 0, 0, 0);
        if (mon >= currentMon) {
          // Remove entries with this recurId from this week onward
          next[key] = (days || []).map(day => day.filter(e => e.recurId !== rid));
        } else {
          // Stop source recurrence by setting recurUntil
          const yesterday = new Date(currentMon);
          yesterday.setDate(yesterday.getDate() - 1);
          const untilStr = yesterday.toISOString().split("T")[0];
          next[key] = (days || []).map(day => day.map(e =>
            e.recurId === rid ? { ...e, recurUntil: untilStr } : e
          ));
        }
      });
      return next;
    });
    setSelectedEntryId(null);
  }

  // Apply current entry's fields to all future occurrences
  function applyToAllFuture(entryId) {
    const entry = weekData.flat().find(e => e.id === entryId);
    if (!entry || !entry.recurId) return;
    const rid = entry.recurId;
    const currentMon = getMondayOfWeek(currentWeek, currentYear);
    currentMon.setHours(0, 0, 0, 0);
    const fields = {
      start: entry.start, end: entry.end, note: entry.note,
      activity: entry.activity, workOrder: entry.workOrder, project: entry.project,
      customer: entry.customer, role: entry.role, billRate: entry.billRate,
      tags: entry.tags || [], recurFrequency: entry.recurFrequency,
      recurUntil: entry.recurUntil || "", recurDays: entry.recurDays || []
    };

    setAllData(prev => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, days]) => {
        const [y, w] = key.split("-W").map(Number);
        if (!y || !w) return;
        const mon = getMondayOfWeek(w, y);
        mon.setHours(0, 0, 0, 0);
        if (mon >= currentMon) {
          next[key] = (days || []).map(day => day.map(e =>
            e.recurId === rid ? { ...e, ...fields } : e
          ));
        }
      });
      return next;
    });
    setRecurPrompt(null);
  }

  // Detach a single occurrence from its recurrence
  function detachFromRecurrence(entryId) {
    const nw = weekData.map(day => day.map(e =>
      e.id === entryId ? { ...e, recurring: false, recurId: "", recurFrequency: "", recurDays: [], recurUntil: "", recurApplied: false } : e
    ));
    setWeekData(nw);
  }

  // ═══ DAILY HOURS ═══
  const dailyHours = weekData.map(day =>
    day.reduce((sum, ent) => {
      const s = parseTime(ent.start), e = parseTime(ent.end);
      return sum + (s !== null && e !== null ? Math.max(0, e - s) : 0);
    }, 0)
  );
  const weeklyTotal = dailyHours.reduce((a, b) => a + b, 0);
  const stdHrs = parseFloat(standardHours) || STANDARD_WEEKLY_HOURS;
  const dailyHrs = stdHrs / 5; // contracted hours per day (for bank holiday deductions)

  // Get all holidays (region + custom) as a map: "YYYY-MM-DD" -> name
  const allHolidays = useMemo(() => {
    const map = {};
    const region = config.bankHolidayRegion;
    if (region && BANK_HOLIDAYS[region]) {
      Object.entries(BANK_HOLIDAYS[region].dates).forEach(([d, name]) => { map[d] = name; });
    }
    Object.entries(config.customHolidays || {}).forEach(([d, name]) => { map[d] = name; });
    return map;
  }, [config.bankHolidayRegion, config.customHolidays]);

  function isHoliday(d) { return allHolidays[dateStr(d)] || null; }

  // Count bank holidays (weekdays only) in a date range
  function countHolidaysInRange(start, end) {
    let count = 0;
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    const endD = new Date(end);
    endD.setHours(23, 59, 59, 999);
    while (d <= endD) {
      if (d.getDay() >= 1 && d.getDay() <= 5 && allHolidays[dateStr(d)]) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  // Build unique note history from all entries for autocomplete
  const noteHistory = useMemo(() => {
    const seen = new Map();
    Object.values(allData).forEach(days => {
      (days || []).forEach(day => {
        (day || []).forEach(ent => {
          if (ent.note && ent.note.trim() && !seen.has(ent.note)) {
            seen.set(ent.note, {
              note: ent.note,
              activity: ent.activity || "",
              role: ent.role || "",
              workOrder: ent.workOrder || "",
              project: ent.project || "",
              customer: ent.customer || "",
              billRate: ent.billRate || "",
              tags: ent.tags || []
            });
          }
        });
      });
    });
    // Also include task titles
    tasks.forEach(t => {
      if (t.title && t.title.trim() && !seen.has(t.title)) {
        seen.set(t.title, {
          note: t.title,
          activity: t.activity || "",
          workOrder: t.workOrder || "",
          project: t.project || "",
          customer: t.customer || "",
          tags: t.tags || []
        });
      }
    });
    return [...seen.values()];
  }, [allData, tasks]);

  // ═══ SELECTED ENTRY ═══
  const dayEntries = weekData[entryDayIndex] || [];
  const selectedEntry = dayEntries.find(e => e.id === selectedEntryId);

  // ═══ CONFIG HELPERS ═══
  function addConfigItem(field, val) { setConfig(prev => ({ ...prev, [field]: [...(prev[field] || []), val] })); }
  function removeConfigItem(field, idx) { setConfig(prev => ({ ...prev, [field]: (prev[field] || []).filter((_, i) => i !== idx) })); }

  // Look up a name in a coded config list and return "Name (CODE)" or just the name
  function resolveLabel(name, configList) {
    if (!name) return "";
    const items = configList || [];
    const found = items.find(it => getItemName(it) === name);
    return found ? getItemLabel(found) : name;
  }

  const getActivitiesForProject = (projectName) => {
    if (projectName) {
      const proj = (activeConfig.projects || []).find(p => getItemName(p) === projectName);
      if (proj && typeof proj === "object" && proj.activityTemplate) {
        const tmpl = (activeConfig.activityTemplates || []).find(t => t.name === proj.activityTemplate);
        if (tmpl) return tmpl.activities;
      }
    }
    return activeConfig.activities || [];
  };

  const getProjectsForCustomer = (customerName) => {
    const allProjects = getItemNames(activeConfig.projects);
    if (!customerName) return allProjects;
    const filtered = (activeConfig.projects || [])
      .filter(p => typeof p === "object" && p.customer === customerName)
      .map(getItemName);
    return filtered.length > 0 ? filtered : allProjects;
  };

  const getWorkOrdersForProject = (projectName) => {
    const allWOs = getItemNames(activeConfig.workOrders);
    if (!projectName) return allWOs;
    const filtered = (activeConfig.workOrders || [])
      .filter(wo => typeof wo === "object" && wo.project === projectName)
      .map(getItemName);
    return filtered.length > 0 ? filtered : allWOs;
  };

  const lookupWorkOrderChain = (woName) => {
    const wo = (activeConfig.workOrders || []).find(w => getItemName(w) === woName);
    const projectName = wo && typeof wo === "object" ? (wo.project || "") : "";
    let customerName = "";
    if (projectName) {
      const proj = (activeConfig.projects || []).find(p => getItemName(p) === projectName);
      customerName = proj && typeof proj === "object" ? (proj.customer || "") : "";
    }
    return { project: projectName, customer: customerName };
  };

  // ═══ REPORTS ═══
  const reportData = useMemo(() => {
    const groups = {};
    Object.entries(allData).forEach(([key, days]) => {
      const [y, w] = key.split("-W").map(Number);
      const mon = getMondayOfWeek(w, y);
      (days || []).forEach((day, di) => {
        const d = new Date(mon);
        d.setDate(d.getDate() + di);
        if (d.getMonth() === reportMonth && d.getFullYear() === reportYear) {
          (day || []).forEach(ent => {
            const s = parseTime(ent.start), e = parseTime(ent.end);
            if (s === null || e === null) return;
            const hrs = Math.max(0, e - s);
            const gKey = ent[reportGroup] || "(unassigned)";
            groups[gKey] = (groups[gKey] || 0) + hrs;
          });
        }
      });
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [allData, reportGroup, reportMonth, reportYear]);

  const reportTotal = reportData.reduce((s, [, h]) => s + h, 0);

  // ═══ NAV ═══
  function navWeek(dir) {
    let w = currentWeek + dir, y = currentYear;
    if (w < 1) { y--; w = 52; } if (w > 52) { y++; w = 1; }
    setCurrentWeek(w); setCurrentYear(y); setSelectedEntryId(null);
    setEntryDayIndex(dir > 0 ? 0 : 6);
  }

  function navDay(dir) {
    let newIdx = entryDayIndex + dir;
    if (newIdx > 6) {
      // Past Sunday → next week Monday
      navWeek(1);
    } else if (newIdx < 0) {
      // Before Monday → previous week Sunday
      navWeek(-1);
    } else {
      setEntryDayIndex(newIdx);
      setSelectedEntryId(null);
    }
  }

  function navReportMonth(dir) {
    let m = reportMonth + dir, y = reportYear;
    if (m < 0) { y--; m = 11; } if (m > 11) { y++; m = 0; }
    setReportMonth(m); setReportYear(y);
  }

  function navReportDate(dir) {
    const d = new Date(reportDate);
    d.setDate(d.getDate() + dir);
    setReportDate(d);
  }

  function navReportWeek(dir) {
    let w = reportWeek + dir, y = reportWeekYear;
    if (w < 1) { y--; w = 52; } if (w > 52) { y++; w = 1; }
    setReportWeek(w); setReportWeekYear(y);
  }

  // ═══ TIMER ═══
  useEffect(() => {
    if (timerStatus === "running") {
      timerRef.current = setInterval(() => {
        setTimerElapsed(Date.now() - timerStartTime.getTime() - timerTotalPaused);
        // Update linked entry's end time to current time
        if (timerEntryId) {
          const n = new Date();
          const nowMins = n.getHours() * 60 + n.getMinutes();
          const snapped = Math.ceil(nowMins / 15) * 15;
          const endStr = timeToStr(snapped / 60);
          updateEntryFields(timerEntryId, { end: endStr });
        }
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerStatus, timerStartTime, timerTotalPaused, timerEntryId]);

  // Save timer state to storage
  useEffect(() => {
    if (loading) return;
    const timerState = timerStatus !== "stopped" ? {
      status: timerStatus, startTime: timerStartTime?.toISOString(), startStr: timerStartStr,
      totalPaused: timerTotalPaused, pauseStart: timerPauseStart,
      note: timerNote, activity: timerActivity, customer: timerCustomer,
      project: timerProject, workOrder: timerWorkOrder, tags: timerTags,
      entryId: timerEntryId
    } : null;
    storageAdapter.set(TIMER_KEY, JSON.stringify(timerState)).catch(() => {});
  }, [timerStatus, timerNote, timerActivity, timerCustomer, timerProject, timerWorkOrder, timerTags, loading]);

  // Save tasks
  useEffect(() => {
    if (loading) return;
    // CRITICAL: never auto-save tasks until a successful load has completed.
    // Without this guard, a transient Supabase load failure would leave tasks=[]
    // and the save effect would DELETE every task from the database.
    if (!tasksLoaded) return;
    const t = setTimeout(() => {
      if (supabaseConfigured && userId !== 'local') {
        saveTasks(userId, tasks, effectiveProfileId).catch(err => console.error("saveTasks failed:", err));
      } else {
        storageAdapter.set(TASKS_KEY, JSON.stringify(tasks)).catch(() => {});
      }
    }, 600);
    return () => clearTimeout(t);
  }, [tasks, loading, tasksLoaded, userId, storageAdapter, effectiveProfileId]);

  // ── AUTOMATIC BACKUPS ──
  // Snapshots the full state into the `backups` table once per 24h while the
  // app is open. The last 14 snapshots are kept; older ones are pruned.
  const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const LAST_BACKUP_KEY = "wht-v3-last-auto-backup";
  const BACKUP_KEEP_COUNT = 14;

  const buildSnapshot = useCallback(() => ({
    data: allData,
    config,
    settings: { standardHours, defaults },
    tasks,
    exportedAt: new Date().toISOString(),
    version: "v3",
  }), [allData, config, standardHours, defaults, tasks]);

  // Load the list of existing backups once the app is ready
  useEffect(() => {
    if (loading || !tasksLoaded) return;
    if (!supabaseConfigured || userId === "local") return;
    let cancelled = false;
    listBackups(userId)
      .then(rows => { if (!cancelled) { setBackups(rows); setBackupsTableMissing(false); } })
      .catch(err => {
        if (err instanceof BackupsTableMissingError) {
          if (!cancelled) setBackupsTableMissing(true);
        } else {
          console.error("listBackups failed:", err);
        }
      });
    return () => { cancelled = true; };
  }, [loading, tasksLoaded, userId, backupsVersion]);

  // One-shot auto-backup per session, throttled to every 24h via localStorage
  useEffect(() => {
    if (loading || !tasksLoaded || didAutoBackup) return;
    if (!supabaseConfigured || userId === "local") return;
    const last = parseInt(localStorage.getItem(LAST_BACKUP_KEY) || "0", 10);
    if (last && Date.now() - last < AUTO_BACKUP_INTERVAL_MS) {
      setDidAutoBackup(true);
      return;
    }
    const t = setTimeout(async () => {
      try {
        await createBackup(userId, "auto", buildSnapshot());
        localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
        await pruneBackups(userId, BACKUP_KEEP_COUNT);
        setBackupsVersion(v => v + 1);
        setBackupsTableMissing(false);
      } catch (err) {
        if (err instanceof BackupsTableMissingError) {
          setBackupsTableMissing(true);
        } else {
          console.error("Auto-backup failed:", err);
        }
      } finally {
        setDidAutoBackup(true);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [loading, tasksLoaded, didAutoBackup, userId, buildSnapshot]);

  async function backupNow() {
    if (!supabaseConfigured || userId === "local") return;
    setBackupBusy("creating");
    try {
      await createBackup(userId, "manual", buildSnapshot());
      localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
      await pruneBackups(userId, BACKUP_KEEP_COUNT);
      setBackupsVersion(v => v + 1);
      setBackupsTableMissing(false);
      setSaveStatus("backed up");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (err) {
      if (err instanceof BackupsTableMissingError) {
        setBackupsTableMissing(true);
      } else {
        console.error("backupNow failed:", err);
        setSaveStatus("backup error");
        setTimeout(() => setSaveStatus(""), 3000);
      }
    } finally {
      setBackupBusy("");
    }
  }

  async function downloadBackup(id) {
    setBackupBusy(id);
    try {
      const b = await getBackup(userId, id);
      const json = JSON.stringify(b.data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date(b.created_at).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `hours-tracker-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("downloadBackup failed:", err);
      setSaveStatus("download error");
      setTimeout(() => setSaveStatus(""), 3000);
    } finally {
      setBackupBusy("");
    }
  }

  async function restoreBackup(id) {
    if (!window.confirm("Restore this backup? This will overwrite your current data.")) return;
    setBackupBusy(id);
    try {
      const b = await getBackup(userId, id);
      const snap = b.data || {};
      if (snap.data) setAllData(snap.data);
      if (snap.config) setConfig(prev => ({ ...prev, ...snap.config }));
      if (snap.settings) {
        if (snap.settings.standardHours) setStandardHours(snap.settings.standardHours);
        if (snap.settings.defaults) setDefaults(prev => ({ ...prev, ...snap.settings.defaults }));
      }
      if (Array.isArray(snap.tasks)) setTasks(snap.tasks);
      setSaveStatus("restored");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (err) {
      console.error("restoreBackup failed:", err);
      setSaveStatus("restore error");
      setTimeout(() => setSaveStatus(""), 3000);
    } finally {
      setBackupBusy("");
    }
  }

  async function removeBackup(id) {
    if (!window.confirm("Delete this backup?")) return;
    setBackupBusy(id);
    try {
      await deleteBackup(userId, id);
      setBackupsVersion(v => v + 1);
    } catch (err) {
      console.error("deleteBackup failed:", err);
    } finally {
      setBackupBusy("");
    }
  }

  // Compute live timer end for calendar display
  const timerLiveEnd = useMemo(() => {
    if (timerStatus === "stopped" || !timerStartStr) return null;
    const startMins = parseTime(timerStartStr);
    if (startMins === null) return null;
    const elapsedHrs = timerElapsed / 3600000;
    const endTime = startMins + Math.max(elapsedHrs, 0.25); // at least 15 min
    return Math.min(endTime, 24);
  }, [timerStatus, timerStartStr, timerElapsed]);

  // ═══ TASK FUNCTIONS ═══
  function getUrgency(task) {
    // If start date is set and hasn't been reached yet, urgency is zero
    if (task.startDate) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const start = new Date(task.startDate + "T00:00:00"); start.setHours(0, 0, 0, 0);
      if (today < start) return { score: 0, label: "Not started", color: "#b0b0b0" };
    }
    if (task.doNow) return { score: 6, label: "Now", color: "#d93025" };
    if (task.urgent) return { score: 5, label: "Urgent", color: "#c5221f" };
    if (!task.dueDate) return { score: 1, label: "Anytime", color: "#80868b" };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate + "T00:00:00"); due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due - today) / 86400000);
    if (diff <= 0) return { score: 4, label: "Today", color: "#ea4335" };
    if (diff === 1) return { score: 3, label: "Tomorrow", color: "#e37400" };
    if (diff <= 7) return { score: 2, label: "This week", color: "#1a73e8" };
    if (diff <= 30) return { score: 1.5, label: "This month", color: "#34a853" };
    return { score: 1, label: "Anytime", color: "#80868b" };
  }

  function setTaskNow(taskId) {
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, doNow: !t.doNow }
      : { ...t, doNow: false }
    ));
  }

  function getLastWeekday(year, month) {
    const d = new Date(year, month + 1, 0); // last day of month
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
  }
  function getFriday(weekOffset) {
    const d = new Date(); d.setHours(0,0,0,0);
    const dayOfWeek = d.getDay(); // 0=Sun
    const daysUntilFri = ((5 - dayOfWeek) + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFri + (weekOffset > 0 ? 7 * (weekOffset - 1) : 0));
    if (weekOffset === 0 && dayOfWeek <= 5 && dayOfWeek > 0) {
      // This week's Friday
      const f = new Date(); f.setHours(0,0,0,0);
      f.setDate(f.getDate() + (5 - dayOfWeek));
      return f;
    }
    return d;
  }

  function setTaskUrgencyLevel(taskId, level) {
    const today = new Date(); today.setHours(0,0,0,0);
    let dueDate = "";
    let doNow = false;
    let urgent = false;

    if (level === "now") {
      doNow = true; dueDate = dateStr(today);
    } else if (level === "urgent") {
      urgent = true; dueDate = dateStr(today);
    } else if (level === "today") {
      dueDate = dateStr(today);
    } else if (level === "tomorrow") {
      const d = new Date(today); d.setDate(d.getDate() + 1);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      dueDate = dateStr(d);
    } else if (level === "thisweek") {
      dueDate = dateStr(getFriday(0));
    } else if (level === "nextweek") {
      const fri = getFriday(0);
      fri.setDate(fri.getDate() + 7);
      dueDate = dateStr(fri);
    } else if (level === "thismonth") {
      dueDate = dateStr(getLastWeekday(today.getFullYear(), today.getMonth()));
    } else {
      // anytime — last weekday of next month
      const nextM = today.getMonth() + 1;
      const yr = nextM > 11 ? today.getFullYear() + 1 : today.getFullYear();
      dueDate = dateStr(getLastWeekday(yr, nextM % 12));
    }

    if (doNow) {
      // Exclusive — clear other now tasks
      setTasks(prev => prev.map(t => t.id === taskId
        ? { ...t, doNow: true, urgent: false, dueDate }
        : { ...t, doNow: false }
      ));
    } else {
      updateTask(taskId, { doNow: false, urgent, dueDate });
    }
  }

  function cancelTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) pushUndo("cancelTask", { ...task });
    updateTask(id, { status: "cancelled", completedDate: dateStr(new Date()), doNow: false, urgent: false });
  }

  const DURATION_OPTIONS = [
    { value: 15, label: "15m" }, { value: 30, label: "30m" },
    { value: 60, label: "1h" }, { value: 120, label: "2h" },
    { value: 225, label: "½ day" }, { value: 450, label: "Full day" }
  ];
  function fmtDuration(mins) {
    if (!mins) return "";
    const opt = DURATION_OPTIONS.find(o => o.value === mins);
    return opt ? opt.label : mins >= 60 ? `${(mins/60).toFixed(1)}h` : `${mins}m`;
  }

  function addTask(title, entryFields) {
    if (!title.trim()) return;
    const ef = entryFields || {};
    const newId = uid();
    setTasks(prev => [...prev, {
      id: newId, title: title.trim(), importance: 3, dueDate: "", startDate: "", doNow: false, urgent: false,
      status: "not_started", project: ef.project || "", customer: ef.customer || "",
      workOrder: ef.workOrder || "", activity: ef.activity || "",
      tags: ef.tags || [], completedDate: "", notes: "", createdDate: dateStr(new Date()),
      duration: 0, recurring: false, recurFrequency: "",
      subtasks: [], delegatedTo: "", delegatedFollowUp: "", blockedBy: "", effortMinutes: 0
    }]);
    setEditingTaskId(newId);
    setNewTaskId(newId);
  }

  function addTaskFromTemplate(template) {
    const newId = uid();
    setTasks(prev => [...prev, {
      ...template, id: newId, status: "not_started", completedDate: "", createdDate: dateStr(new Date()),
      subtasks: (template.subtasks || []).map(s => ({ ...s, id: uid(), done: false })),
      effortMinutes: 0
    }]);
    setEditingTaskId(newId);
    setNewTaskId(newId);
  }

  function pushUndo(action, data) {
    setUndoStack(prev => [...prev.slice(-9), { action, data, time: Date.now() }]);
  }
  function performUndo() {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    if (last.action === "deleteTask" || last.action === "completeTask" || last.action === "cancelTask") {
      setTasks(prev => [...prev.map(t => t.id === last.data.id ? last.data : t),
        ...(prev.some(t => t.id === last.data.id) ? [] : [last.data])]);
    } else if (last.action === "deleteEntry") {
      setWeekData(prev => {
        const nw = [...prev]; nw[last.data.dayIdx] = [...(nw[last.data.dayIdx] || []), last.data.entry]; return nw;
      });
    }
  }

  function updateTask(id, fields) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
  }

  function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) pushUndo("deleteTask", { ...task });
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  function getNextDueDate(currentDue, frequency) {
    const base = currentDue ? new Date(currentDue + "T00:00:00") : new Date();
    base.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // Start from whichever is later: the current due date or today
    const from = base > today ? base : today;
    const d = new Date(from);
    if (frequency === "daily") {
      d.setDate(d.getDate() + 1);
      // Skip weekends
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    } else if (frequency === "weekly") {
      d.setDate(d.getDate() + 7);
    } else if (frequency === "monthly") {
      d.setMonth(d.getMonth() + 1);
    } else if (frequency === "annually") {
      d.setFullYear(d.getFullYear() + 1);
    }
    return dateStr(d);
  }

  function completeTask(id) {
    setTasks(prev => {
      const task = prev.find(t => t.id === id);
      if (!task) return prev;
      pushUndo("completeTask", { ...task });
      // Calculate effort: sum all time entries linked to this task
      let effort = task.effortMinutes || 0;
      Object.values(allData).forEach(week => {
        (week || []).forEach(day => {
          (day || []).forEach(e => {
            if (e.taskId === id) {
              const s = parseTime(e.start), en = parseTime(e.end);
              if (s !== null && en !== null) effort += (en - s) * 60;
            }
          });
        });
      });
      const updated = prev.map(t => t.id === id ? { ...t, status: "completed", completedDate: dateStr(new Date()), doNow: false, urgent: false, effortMinutes: Math.round(effort) } : t);
      if (task.recurring && task.recurFrequency) {
        const nextDue = getNextDueDate(task.dueDate, task.recurFrequency);
        updated.push({
          id: uid(), title: task.title, importance: task.importance, dueDate: nextDue, doNow: false, urgent: false,
          status: "not_started", project: task.project || "", customer: task.customer || "",
          workOrder: task.workOrder || "", activity: task.activity || "",
          tags: task.tags || [], completedDate: "", notes: task.notes || "",
          createdDate: dateStr(new Date()), duration: task.duration || 0,
          recurring: true, recurFrequency: task.recurFrequency,
          subtasks: (task.subtasks || []).map(s => ({ ...s, id: uid(), done: false })),
          delegatedTo: "", delegatedFollowUp: "", blockedBy: "", effortMinutes: 0
        });
      }
      return updated;
    });
  }

  function scheduleTask(task) {
    setSchedulingTask(task);
    // Navigate to today on the week tab
    const n = new Date();
    setCurrentWeek(getWeekNumber(n));
    setCurrentYear(n.getFullYear());
    setEntryDayIndex((n.getDay() + 6) % 7);
    setCalendarView("day");
    setSelectedEntryId(null);
    setActiveTab("week");
  }

  function startTaskTimer(task) {
    if (timerStatus !== "stopped") return;
    const n = new Date();
    const mins = n.getHours() * 60 + n.getMinutes();
    const snapped = Math.round(mins / 15) * 15;
    const h = Math.floor(snapped / 60), m = snapped % 60;
    setTimerStartStr(`${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`);
    setTimerStartTime(n);
    setTimerElapsed(0);
    setTimerTotalPaused(0);
    setTimerPauseStart(null);
    setTimerNote(task.title);
    setTimerActivity(task.activity || defaults.activity || "");
    setTimerProject(task.project || defaults.project || "");
    setTimerCustomer(task.customer || defaults.customer || "");
    setTimerWorkOrder(task.workOrder || defaults.workOrder || "");
    setTimerTags(task.tags || []);
    setTimerStatus("running");
    updateTask(task.id, { status: "in_progress" });
    setActiveTab("week");
  }

  const activeTasks = useMemo(() => {
    let filtered = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
    if (taskFilter !== "all") filtered = filtered.filter(t => t.status === taskFilter);
    if (taskDurationFilter > 0) filtered = filtered.filter(t => (t.duration || 0) === taskDurationFilter);
    if (taskSearch.trim()) {
      const q = taskSearch.toLowerCase();
      filtered = filtered.filter(t =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.project || "").toLowerCase().includes(q) ||
        (t.customer || "").toLowerCase().includes(q) ||
        (t.activity || "").toLowerCase().includes(q) ||
        (t.workOrder || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      );
    }
    if (taskSort === "manual") return filtered;
    return filtered.sort((a, b) => {
      if (taskSort === "priority") {
        const pa = getUrgency(a).score * (a.importance || 1);
        const pb = getUrgency(b).score * (b.importance || 1);
        return pb - pa;
      }
      if (taskSort === "due") return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [tasks, taskFilter, taskSort, taskDurationFilter, taskSearch]);

  const completedTasks = useMemo(() => {
    return tasks.filter(t => t.status === "completed").sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || ""));
  }, [tasks]);

  const cancelledTasks = useMemo(() => {
    return tasks.filter(t => t.status === "cancelled").sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || ""));
  }, [tasks]);

  // Tasks for review (active, sorted by priority)
  const reviewTasks = useMemo(() => {
    return tasks.filter(t => t.status !== "completed" && t.status !== "cancelled")
      .sort((a, b) => (getUrgency(b).score * (b.importance || 1)) - (getUrgency(a).score * (a.importance || 1)));
  }, [tasks]);

  const [showRecommendations, setShowRecommendations] = useState(false);

  // Calculate time until next calendar block
  const timeGap = useMemo(() => {
    const n = new Date();
    const nowMins = n.getHours() * 60 + n.getMinutes();
    // Round down to nearest 5 min
    const nowRounded = Math.floor(nowMins / 5) * 5;

    // Get today's entries
    const todayWn = getWeekNumber(n);
    const todayYear = n.getFullYear();
    const todayKey = `${todayYear}-W${todayWn}`;
    const todayDayIdx = (n.getDay() + 6) % 7;
    const todayEntries = (allData[todayKey] || [])[todayDayIdx] || [];

    // Parse and sort by start time
    const blocks = todayEntries
      .map(e => ({ s: parseTime(e.start), e: parseTime(e.end) }))
      .filter(b => b.s !== null && b.e !== null)
      .sort((a, b) => a.s - b.s);

    // Also include live timer block
    if (timerStatus !== "stopped" && timerStartStr) {
      const ts = parseTime(timerStartStr);
      if (ts !== null && timerLiveEnd) blocks.push({ s: ts, e: timerLiveEnd });
      blocks.sort((a, b) => a.s - b.s);
    }

    const nowHrs = nowRounded / 60;

    // Are we currently inside a block?
    const inBlock = blocks.find(b => nowHrs >= b.s && nowHrs < b.e);
    if (inBlock) {
      // Find next block after current one ends
      const afterCurrent = blocks.filter(b => b.s >= inBlock.e).sort((a, b) => a.s - b.s);
      if (afterCurrent.length > 0) {
        const gapMins = Math.round((afterCurrent[0].s - inBlock.e) * 60);
        const roundedGap = Math.floor(gapMins / 5) * 5;
        return { available: Math.max(roundedGap, 0), nextBlock: timeToStr(afterCurrent[0].s), freeFrom: timeToStr(inBlock.e), inBlock: true };
      }
      // Rest of day is free after current block
      const endOfDay = parseTime(defaults.endTime || "17:00") || 17;
      const remainMins = Math.round((endOfDay - inBlock.e) * 60);
      const roundedRemain = Math.floor(remainMins / 5) * 5;
      return { available: Math.max(roundedRemain, 0), nextBlock: null, freeFrom: timeToStr(inBlock.e), inBlock: true };
    }

    // Not in a block — find next block after now
    const nextBlock = blocks.find(b => b.s > nowHrs);
    if (nextBlock) {
      const gapMins = Math.round((nextBlock.s - nowHrs) * 60);
      const roundedGap = Math.floor(gapMins / 5) * 5;
      return { available: Math.max(roundedGap, 0), nextBlock: timeToStr(nextBlock.s), freeFrom: null, inBlock: false };
    }

    // No more blocks today — time until end of work day
    const endOfDay = parseTime(defaults.endTime || "17:00") || 17;
    const remainMins = Math.round((endOfDay - nowHrs) * 60);
    const roundedRemain = Math.floor(remainMins / 5) * 5;
    return { available: Math.max(roundedRemain, 0), nextBlock: null, freeFrom: null, inBlock: false };
  }, [allData, timerStatus, timerStartStr, timerLiveEnd, defaults.endTime, timerElapsed]);

  function fmtGapTime(mins) {
    if (mins <= 0) return "0m";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  // Recommend tasks that fit in the available time
  const recommendations = useMemo(() => {
    if (!showRecommendations) return [];
    const avail = timeGap.available;
    if (avail <= 0) return [];

    // Get active non-completed tasks with duration, sorted by priority desc
    const candidates = tasks
      .filter(t => t.status !== "completed" && t.status !== "cancelled" && (t.duration || 0) > 0 && (t.duration || 0) <= avail)
      .map(t => ({ ...t, priority: getUrgency(t).score * (t.importance || 1) }))
      .sort((a, b) => b.priority - a.priority);

    const results = [];

    // Single task options (top 3 by priority that fit)
    candidates.slice(0, 3).forEach(t => {
      results.push({ type: "single", tasks: [t], totalMins: t.duration, totalPriority: t.priority });
    });

    // Group options: find combos of small tasks that fill the time well
    // Greedy: pack highest priority tasks first
    const shortTasks = candidates.filter(t => t.duration <= avail / 2 && t.duration <= 30);
    if (shortTasks.length >= 2) {
      let packed = [];
      let packedMins = 0;
      let packedPri = 0;
      const used = new Set();
      for (const t of shortTasks) {
        if (packedMins + t.duration <= avail && !used.has(t.id)) {
          packed.push(t);
          packedMins += t.duration;
          packedPri += t.priority;
          used.add(t.id);
        }
      }
      if (packed.length >= 2) {
        // Check this isn't a duplicate of an existing single result
        const isDupe = results.some(r => r.tasks.length === 1 && packed.length === 1 && r.tasks[0].id === packed[0].id);
        if (!isDupe) {
          results.push({ type: "group", tasks: packed, totalMins: packedMins, totalPriority: packedPri });
        }
      }
    }

    // Deduplicate: if a single task appears in both single and group, keep both (they're different options)
    return results;
  }, [showRecommendations, timeGap.available, tasks]);

  // Auto-reset My Day when date changes
  useEffect(() => {
    const today = dateStr(new Date());
    if (myDay.date !== today) setMyDay({ date: today, frog: "", priorities: [] });
  }, [activeTab, taskView]);

  function setFrog(taskId) {
    setMyDay(prev => ({ ...prev, frog: prev.frog === taskId ? "" : taskId }));
  }
  function togglePriority(taskId) {
    setMyDay(prev => {
      const p = [...prev.priorities];
      const idx = p.indexOf(taskId);
      if (idx >= 0) { p.splice(idx, 1); return { ...prev, priorities: p }; }
      if (p.length >= 3) return prev;
      return { ...prev, priorities: [...p, taskId] };
    });
  }
  function reorderPriority(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    setMyDay(prev => {
      const p = [...prev.priorities];
      const [moved] = p.splice(fromIdx, 1);
      p.splice(toIdx, 0, moved);
      return { ...prev, priorities: p };
    });
  }

  // Tasks due today
  const dueTodayTasks = useMemo(() => {
    const today = dateStr(new Date());
    return tasks.filter(t => t.status !== "completed" && t.status !== "cancelled" && t.dueDate === today)
      .sort((a, b) => (getUrgency(b).score * (b.importance || 1)) - (getUrgency(a).score * (a.importance || 1)));
  }, [tasks]);

  // All free windows today for My Day schedule
  const todayFreeWindows = useMemo(() => {
    const n = new Date();
    const nowHrs = n.getHours() + n.getMinutes() / 60;
    const wn = getWeekNumber(n);
    const yr = n.getFullYear();
    const key = `${yr}-W${wn}`;
    const di = (n.getDay() + 6) % 7;
    const entries = (allData[key] || [])[di] || [];

    const blocks = entries.map(e => ({ s: parseTime(e.start), e: parseTime(e.end) }))
      .filter(b => b.s !== null && b.e !== null).sort((a, b) => a.s - b.s);
    if (timerStatus !== "stopped" && timerStartStr && timerLiveEnd) {
      const ts = parseTime(timerStartStr);
      if (ts !== null) { blocks.push({ s: ts, e: timerLiveEnd }); blocks.sort((a, b) => a.s - b.s); }
    }

    const dayStart = Math.max(nowHrs, parseTime(defaults.startTime || "08:00") || 8);
    const dayEnd = parseTime(defaults.endTime || "17:00") || 17;
    if (dayStart >= dayEnd) return [];

    // Merge overlapping blocks
    const merged = [];
    blocks.forEach(b => {
      if (merged.length > 0 && b.s <= merged[merged.length - 1].e) {
        merged[merged.length - 1].e = Math.max(merged[merged.length - 1].e, b.e);
      } else merged.push({ ...b });
    });

    // Find gaps
    const windows = [];
    let cursor = dayStart;
    merged.filter(b => b.e > dayStart && b.s < dayEnd).forEach(b => {
      const gapStart = Math.max(cursor, dayStart);
      const gapEnd = Math.min(b.s, dayEnd);
      if (gapEnd > gapStart) {
        const mins = Math.floor((gapEnd - gapStart) * 60 / 5) * 5;
        if (mins >= 5) windows.push({ from: timeToStr(gapStart), to: timeToStr(gapEnd), mins });
      }
      cursor = Math.max(cursor, b.e);
    });
    // After last block
    if (cursor < dayEnd) {
      const mins = Math.floor((dayEnd - cursor) * 60 / 5) * 5;
      if (mins >= 5) windows.push({ from: timeToStr(cursor), to: timeToStr(dayEnd), mins });
    }
    return windows;
  }, [allData, timerStatus, timerStartStr, timerLiveEnd, defaults.startTime, defaults.endTime, timerElapsed]);

  const totalFreeToday = useMemo(() => todayFreeWindows.reduce((s, w) => s + w.mins, 0), [todayFreeWindows]);

  // Smart My Day schedule: assign highest priority tasks to available windows
  const myDaySchedule = useMemo(() => {
    if (taskView !== "myday") return [];
    const candidates = tasks
      .filter(t => t.status !== "completed" && t.status !== "cancelled" && (t.duration || 0) > 0)
      .map(t => ({ ...t, pri: getUrgency(t).score * (t.importance || 1) }))
      .sort((a, b) => {
        // Frog first, then top 3 priorities, then by priority score
        if (myDay.frog === a.id) return -1;
        if (myDay.frog === b.id) return 1;
        const ai = myDay.priorities.indexOf(a.id);
        const bi = myDay.priorities.indexOf(b.id);
        if (ai >= 0 && bi < 0) return -1;
        if (bi >= 0 && ai < 0) return 1;
        if (ai >= 0 && bi >= 0) return ai - bi;
        return b.pri - a.pri;
      });

    const schedule = [];
    const windows = todayFreeWindows.map(w => ({ ...w, remaining: w.mins }));

    for (const task of candidates) {
      for (const win of windows) {
        if (win.remaining >= task.duration) {
          const startMins = win.mins - win.remaining;
          schedule.push({ task, window: win, startOffset: startMins });
          win.remaining -= task.duration;
          break;
        }
      }
    }
    return schedule;
  }, [taskView, tasks, todayFreeWindows, myDay.frog, myDay.priorities]);

  // ═══ TASK METRICS ═══
  const taskMetrics = useMemo(() => {
    if (taskView !== "taskreports") return null;
    const active = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
    const completed = tasks.filter(t => t.status === "completed");
    const cancelled = tasks.filter(t => t.status === "cancelled");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayS = dateStr(today);

    // Tasks by status
    const byStatus = { not_started: 0, in_progress: 0, on_hold: 0 };
    active.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });

    // Tasks by urgency
    const byUrgency = {};
    active.forEach(t => { const u = getUrgency(t).label; byUrgency[u] = (byUrgency[u] || 0) + 1; });

    // Overdue
    const overdue = active.filter(t => t.dueDate && t.dueDate < todayS).length;

    // Time needed by period
    function tasksDueInRange(start, end) {
      return active.filter(t => {
        if (!t.dueDate) return false;
        return t.dueDate >= dateStr(start) && t.dueDate <= dateStr(end);
      });
    }
    function sumDuration(list) { return list.reduce((s, t) => s + (t.duration || 0), 0); }

    // Today
    const dueToday = active.filter(t => t.dueDate === todayS || t.doNow);
    const dueTodayMins = sumDuration(dueToday);
    const freeTodayMins = totalFreeToday;

    // This week (Mon-Sun)
    const thisWeekMon = getMondayOfWeek(getWeekNumber(today), today.getFullYear());
    const thisWeekSun = new Date(thisWeekMon); thisWeekSun.setDate(thisWeekSun.getDate() + 6);
    const dueThisWeek = tasksDueInRange(thisWeekMon, thisWeekSun);
    const dueThisWeekAll = active.filter(t => t.doNow || t.urgent || (t.dueDate && t.dueDate <= dateStr(thisWeekSun)));
    const dueThisWeekMins = sumDuration(dueThisWeekAll);

    // Calendar hours this week
    let calThisWeek = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(thisWeekMon); d.setDate(d.getDate() + i);
      if (d < today) continue;
      const dayStart = parseTime(defaults.startTime || "08:00") || 8;
      const dayEnd = parseTime(defaults.endTime || "17:00") || 17;
      const wn = getWeekNumber(d); const yr = d.getFullYear();
      const key = `${yr}-W${wn}`; const di = (d.getDay() + 6) % 7;
      const entries = (allData[key] || [])[di] || [];
      const booked = entries.reduce((s, e) => { const es = parseTime(e.start), ee = parseTime(e.end); return (es !== null && ee !== null) ? s + (ee - es) : s; }, 0);
      const dayTotal = Math.max(dayEnd - dayStart, 0);
      calThisWeek += Math.max(dayTotal - booked, 0) * 60;
    }

    // This month
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const dueThisMonthAll = active.filter(t => t.doNow || t.urgent || (t.dueDate && t.dueDate <= dateStr(monthEnd)));
    const dueThisMonthMins = sumDuration(dueThisMonthAll);

    let calThisMonth = 0;
    for (let d = new Date(today); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      if (allHolidays[dateStr(d)]) continue;
      const dayStart = parseTime(defaults.startTime || "08:00") || 8;
      const dayEnd = parseTime(defaults.endTime || "17:00") || 17;
      calThisMonth += Math.max(dayEnd - dayStart, 0) * 60;
    }

    // Next month
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const dueNextMonthAll = active.filter(t => t.dueDate && t.dueDate >= dateStr(nextMonthStart) && t.dueDate <= dateStr(nextMonthEnd));
    const dueNextMonthMins = sumDuration(dueNextMonthAll);

    let calNextMonth = 0;
    for (let d = new Date(nextMonthStart); d <= nextMonthEnd; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      if (allHolidays[dateStr(d)]) continue;
      const dayStart = parseTime(defaults.startTime || "08:00") || 8;
      const dayEnd = parseTime(defaults.endTime || "17:00") || 17;
      calNextMonth += Math.max(dayEnd - dayStart, 0) * 60;
    }

    // Completed this week / month
    const completedThisWeek = completed.filter(t => t.completedDate && t.completedDate >= dateStr(thisWeekMon)).length;
    const completedThisMonth = completed.filter(t => t.completedDate && t.completedDate >= dateStr(monthStart)).length;

    // No duration set
    const noDuration = active.filter(t => !t.duration || t.duration === 0).length;
    // No due date
    const noDueDate = active.filter(t => !t.dueDate).length;
    // Average importance
    const avgImportance = active.length > 0 ? (active.reduce((s, t) => s + (t.importance || 1), 0) / active.length).toFixed(1) : 0;
    // Recurring
    const recurringCount = active.filter(t => t.recurring).length;

    return {
      total: active.length, completed: completed.length, cancelled: cancelled.length,
      byStatus, byUrgency, overdue, noDuration, noDueDate, avgImportance, recurringCount,
      completedThisWeek, completedThisMonth,
      today: { tasks: dueToday.length, mins: dueTodayMins, free: freeTodayMins },
      week: { tasks: dueThisWeekAll.length, mins: dueThisWeekMins, free: calThisWeek },
      month: { tasks: dueThisMonthAll.length, mins: dueThisMonthMins, free: calThisMonth },
      nextMonth: { tasks: dueNextMonthAll.length, mins: dueNextMonthMins, free: calNextMonth }
    };
  }, [taskView, tasks, totalFreeToday, allData, defaults, allHolidays]);

  function startTimer() {
    const n = new Date();
    const mins = n.getHours() * 60 + n.getMinutes();
    const snapped = Math.round(mins / 15) * 15;
    const h = Math.floor(snapped / 60), m = snapped % 60;
    setTimerStartStr(`${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`);
    setTimerStartTime(n);
    setTimerElapsed(0);
    setTimerTotalPaused(0);
    setTimerPauseStart(null);
    setTimerCustomer(defaults.customer || "");
    setTimerProject(defaults.project || "");
    setTimerWorkOrder(defaults.workOrder || "");
    setTimerActivity(defaults.activity || "");
    setTimerStatus("running");
    setTimeout(() => { if (timerNoteRef.current) timerNoteRef.current.focus(); }, 100);
  }

  function pauseTimer() {
    setTimerPauseStart(Date.now());
    setTimerStatus("paused");
  }

  function resumeTimer() {
    if (timerPauseStart) {
      setTimerTotalPaused(prev => prev + (Date.now() - timerPauseStart));
    }
    setTimerPauseStart(null);
    setTimerStatus("running");
  }

  function stopTimer() {
    const n = new Date();
    const mins = n.getHours() * 60 + n.getMinutes();
    const snapped = Math.round(mins / 15) * 15;
    const h = Math.floor(snapped / 60), m = snapped % 60;
    const endStr = `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`;

    let pausedMs = timerTotalPaused;
    if (timerPauseStart) pausedMs += Date.now() - timerPauseStart;
    const pausedHrs = pausedMs / 3600000;
    const pausedSnapped = Math.round(pausedHrs * 4) / 4;

    if (timerEntryId) {
      // Timer was linked to an existing entry — update its end time and fields
      updateEntryFields(timerEntryId, {
        end: endStr,
        note: timerNote,
        customer: timerCustomer,
        project: timerProject,
        workOrder: timerWorkOrder,
        activity: timerActivity,
        tags: timerTags,
        timerPausedHrs: pausedSnapped
      });
      setSelectedEntryId(timerEntryId);
      resetTimer();
      return;
    }

    // No linked entry — create new entry as before
    const startDay = timerStartTime;
    const wn = getWeekNumber(startDay);
    const wy = startDay.getFullYear();
    const wKey = `${wy}-W${wn}`;
    const dayIdx = (startDay.getDay() + 6) % 7;

    const newEntry = {
      id: uid(),
      start: timerStartStr,
      end: endStr,
      customer: timerCustomer,
      project: timerProject,
      workOrder: timerWorkOrder,
      activity: timerActivity,
      role: defaults.role || "",
      billRate: defaults.billRate || "",
      tag: undefined,
      tags: timerTags,
      note: timerNote,
      timerPausedHrs: pausedSnapped
    };

    setAllData(prev => {
      const weekData = prev[wKey] || [[], [], [], [], [], [], []];
      const updated = [...weekData];
      updated[dayIdx] = [...(updated[dayIdx] || []), newEntry];
      return { ...prev, [wKey]: updated };
    });

    setCurrentWeek(wn);
    setCurrentYear(wy);
    setEntryDayIndex(dayIdx);
    setSelectedEntryId(newEntry.id);
    setActiveTab("week");

    resetTimer();
  }

  function discardTimer() {
    resetTimer();
  }

  function resetTimer() {
    setTimerStatus("stopped");
    setTimerStartTime(null);
    setTimerStartStr("");
    setTimerElapsed(0);
    setTimerTotalPaused(0);
    setTimerPauseStart(null);
    setTimerCustomer("");
    setTimerProject("");
    setTimerWorkOrder("");
    setTimerActivity("");
    setTimerTags([]);
    setTimerNote("");
    setTimerEntryId(null);
  }

  function formatTimerDisplay(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2,"0")}:${mins.toString().padStart(2,"0")}:${secs.toString().padStart(2,"0")}`;
  }

  function formatTimerPaused() {
    let pausedMs = timerTotalPaused;
    if (timerPauseStart) pausedMs += Date.now() - timerPauseStart;
    const totalMins = Math.floor(pausedMs / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs > 0) return `${hrs}h ${mins}m paused`;
    return `${mins}m paused`;
  }

  // Helper: get all entries for a specific date
  function getEntriesForDate(targetDate) {
    const entries = [];
    Object.entries(allData).forEach(([key, days]) => {
      const [y, w] = key.split("-W").map(Number);
      const mon = getMondayOfWeek(w, y);
      (days || []).forEach((day, di) => {
        const d = new Date(mon);
        d.setDate(d.getDate() + di);
        if (d.toDateString() === targetDate.toDateString()) {
          (day || []).forEach(ent => entries.push(ent));
        }
      });
    });
    return entries;
  }

  // Helper: sum hours for entries
  function sumEntryHours(entries) {
    return entries.reduce((sum, ent) => {
      const s = parseTime(ent.start), e = parseTime(ent.end);
      return sum + (s !== null && e !== null ? Math.max(0, e - s) : 0);
    }, 0);
  }

  // Helper: get hours for a date
  function getHoursForDate(targetDate) {
    return sumEntryHours(getEntriesForDate(targetDate));
  }

  // Helper: get all entries in a date range
  function getEntriesInRange(startDate, endDate) {
    const entries = [];
    Object.entries(allData).forEach(([key, days]) => {
      const [y, w] = key.split("-W").map(Number);
      const mon = getMondayOfWeek(w, y);
      (days || []).forEach((day, di) => {
        const d = new Date(mon);
        d.setDate(d.getDate() + di);
        if (d >= startDate && d <= endDate) {
          (day || []).forEach(ent => entries.push({ ...ent, date: new Date(d) }));
        }
      });
    });
    return entries;
  }

  // Apply report filter to entries
  function filterEntries(entries) {
    if (reportFilterField === "none" || reportFilterValues.length === 0) return entries;
    const valSet = new Set(reportFilterValues);
    return entries.filter(ent => {
      if (reportFilterField === "tag") {
        const entTags = ent.tags && ent.tags.length > 0 ? ent.tags : (ent.tag ? [ent.tag] : []);
        return entTags.some(t => valSet.has(t));
      }
      return valSet.has(ent[reportFilterField]);
    });
  }

  // Get all unique values for a filter field across all entries
  function getFilterValues(field) {
    const vals = new Set();
    Object.values(allData).forEach(days => {
      (days || []).forEach(day => {
        (day || []).forEach(ent => {
          if (field === "tag") {
            const entTags = ent.tags && ent.tags.length > 0 ? ent.tags : (ent.tag ? [ent.tag] : []);
            entTags.forEach(t => vals.add(t));
          } else if (ent[field]) {
            vals.add(ent[field]);
          }
        });
      });
    });
    return [...vals].sort();
  }

  // Filtered versions of helper functions for reports
  function getFilteredEntriesForDate(targetDate) {
    return filterEntries(getEntriesForDate(targetDate));
  }
  function getFilteredHoursForDate(targetDate) {
    return sumEntryHours(getFilteredEntriesForDate(targetDate));
  }

  // Helper: group entries by a field and sum hours
  function groupEntriesBy(entries, field) {
    // Determine a sensible sub-group field
    const subFieldMap = { customer: "project", project: "activity", workOrder: "activity", activity: "project", role: "project", billRate: "project", tag: "project" };
    const subField = subFieldMap[field] || null;

    const groups = {};
    entries.forEach(ent => {
      const s = parseTime(ent.start), e = parseTime(ent.end);
      if (s === null || e === null) return;
      const hrs = Math.max(0, e - s);

      function addToGroup(key) {
        if (!groups[key]) groups[key] = { total: 0, subs: {} };
        groups[key].total += hrs;
        if (subField) {
          const subKey = (subField === "tag")
            ? ((ent.tags && ent.tags.length > 0 ? ent.tags : (ent.tag ? [ent.tag] : ["(untagged)"])).join(", "))
            : (ent[subField] || "(unassigned)");
          groups[key].subs[subKey] = (groups[key].subs[subKey] || 0) + hrs;
        }
      }

      if (field === "tag") {
        const entryTags = ent.tags && ent.tags.length > 0 ? ent.tags : (ent.tag ? [ent.tag] : []);
        if (entryTags.length === 0) addToGroup("(untagged)");
        else entryTags.forEach(t => addToGroup(t));
      } else {
        addToGroup(ent[field] || "(unassigned)");
      }
    });

    return Object.entries(groups)
      .map(([name, { total, subs }]) => [name, total, Object.entries(subs).sort((a, b) => b[1] - a[1])])
      .sort((a, b) => b[1] - a[1]);
  }

  // Get date range for current report view
  function getReportDateRange() {
    if (reportView === "daily") {
      const d = new Date(reportDate);
      return [new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0), new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)];
    } else if (reportView === "weekly" || reportView === "batch") {
      const mon = getMondayOfWeek(reportWeek, reportWeekYear);
      const sun = new Date(mon); sun.setDate(sun.getDate() + 6); sun.setHours(23, 59, 59);
      return [mon, sun];
    } else if (reportView === "monthly") {
      return [new Date(reportYear, reportMonth, 1), new Date(reportYear, reportMonth + 1, 0, 23, 59, 59)];
    } else {
      const today = new Date(); today.setHours(23, 59, 59, 999);
      const yearEnd = reportAnnualYear < now.getFullYear() ? new Date(reportAnnualYear, 11, 31, 23, 59, 59) : today;
      return [new Date(reportAnnualYear, 0, 1), yearEnd];
    }
  }

  // Grouped report data
  const groupedReportData = useMemo(() => {
    if (reportGroup === "none") return null;
    const [start, end] = getReportDateRange();
    const entries = filterEntries(getEntriesInRange(start, end));
    return groupEntriesBy(entries, reportGroup);
  }, [allData, reportGroup, reportView, reportDate, reportWeek, reportWeekYear, reportMonth, reportYear, reportAnnualYear, reportFilterField, reportFilterValues]);

  // Good/Bad time summary for current report period
  const timeQuality = useMemo(() => {
    const cats = config.tagCategories || {};
    const hasCats = Object.keys(cats).length > 0;
    if (!hasCats) return null;
    const [start, end] = getReportDateRange();
    const entries = filterEntries(getEntriesInRange(start, end));
    let good = 0, bad = 0, neutral = 0;
    entries.forEach(ent => {
      const s = parseTime(ent.start), e = parseTime(ent.end);
      if (s === null || e === null) return;
      const hrs = Math.max(0, e - s);
      const entTags = ent.tags && ent.tags.length > 0 ? ent.tags : (ent.tag ? [ent.tag] : []);
      let entCat = "";
      entTags.forEach(t => { if (cats[t] === "bad") entCat = "bad"; else if (cats[t] === "good" && entCat !== "bad") entCat = "good"; });
      if (entCat === "good") good += hrs;
      else if (entCat === "bad") bad += hrs;
      else neutral += hrs;
    });
    const total = good + bad + neutral;
    return { good, bad, neutral, total };
  }, [allData, config.tagCategories, reportView, reportDate, reportWeek, reportWeekYear, reportMonth, reportYear, reportAnnualYear, reportFilterField, reportFilterValues]);

  // Weekly report data
  const weeklyReportData = useMemo(() => {
    const mon = getMondayOfWeek(reportWeek, reportWeekYear);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const days = DAYS.map((_, i) => {
      const d = new Date(mon); d.setDate(d.getDate() + i);
      return { date: d, label: SHORT_DAYS[i], fullLabel: formatDateLong(d), hours: getFilteredHoursForDate(d), entries: getFilteredEntriesForDate(d), holiday: isHoliday(d) };
    });
    const total = days.reduce((s, d) => s + d.hours, 0);
    const holidayCount = countHolidaysInRange(mon, sun);
    const contracted = stdHrs - (holidayCount * dailyHrs);
    return { days, total, overtime: total - contracted, contracted, holidayCount };
  }, [allData, reportWeek, reportWeekYear, stdHrs, reportFilterField, reportFilterValues, allHolidays]);

  // Monthly report data (weekly breakdown)
  const monthlyReportData = useMemo(() => {
    const weeks = [];
    let totalHours = 0;
    // Find all weeks that overlap this month
    const firstDay = new Date(reportYear, reportMonth, 1);
    const lastDay = new Date(reportYear, reportMonth + 1, 0);
    const seenWeeks = new Set();

    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const wn = getWeekNumber(new Date(d));
      const wy = d.getFullYear();
      const wKey = `${wy}-W${wn}`;
      if (seenWeeks.has(wKey)) continue;
      seenWeeks.add(wKey);

      const wMon = getMondayOfWeek(wn, wy);
      let weekHours = 0;
      for (let i = 0; i < 7; i++) {
        const dd = new Date(wMon); dd.setDate(dd.getDate() + i);
        if (dd.getMonth() === reportMonth && dd.getFullYear() === reportYear) {
          weekHours += getFilteredHoursForDate(dd);
        }
      }
      weeks.push({ weekNum: wn, hours: weekHours, startDate: wMon });
      totalHours += weekHours;
    }

    const daysInMonth = lastDay.getDate();
    let weekdays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(reportYear, reportMonth, d).getDay();
      if (dow >= 1 && dow <= 5) weekdays++;
    }
    const contracted = (weekdays / 5) * stdHrs;
    const holidayCount = countHolidaysInRange(firstDay, lastDay);
    const adjustedContracted = contracted - (holidayCount * dailyHrs);

    return { weeks, totalHours, contracted: adjustedContracted, overtime: totalHours - adjustedContracted, holidayCount };
  }, [allData, reportMonth, reportYear, stdHrs, reportFilterField, reportFilterValues, allHolidays]);

  // Annual report data (monthly breakdown)
  const annualReportData = useMemo(() => {
    const months = [];
    let totalHours = 0;
    const today = new Date(); today.setHours(23, 59, 59, 999);

    for (let m = 0; m < 12; m++) {
      let mHours = 0;
      const daysInMonth = new Date(reportAnnualYear, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(reportAnnualYear, m, d);
        if (date > today) break;
        mHours += getFilteredHoursForDate(date);
      }
      months.push({ month: MONTHS[m], hours: mHours });
      totalHours += mHours;
    }

    // Contracted up to today or end of year
    const yearEnd = reportAnnualYear < now.getFullYear() ? new Date(reportAnnualYear, 11, 31) : today;
    const yearStart = new Date(reportAnnualYear, 0, 1);
    let weekdaysElapsed = 0;
    const d2 = new Date(yearStart);
    while (d2 <= yearEnd) {
      if (d2.getDay() >= 1 && d2.getDay() <= 5) weekdaysElapsed++;
      d2.setDate(d2.getDate() + 1);
    }
    const contracted = (weekdaysElapsed / 5) * stdHrs;
    const holidayCount = countHolidaysInRange(yearStart, yearEnd);
    const adjustedContracted = contracted - (holidayCount * dailyHrs);

    return { months, totalHours, contracted: adjustedContracted, overtime: totalHours - adjustedContracted, weekdaysElapsed, holidayCount };
  }, [allData, reportAnnualYear, stdHrs, reportFilterField, reportFilterValues, allHolidays]);

  // Batch report data (project → work order → daily hours grid)
  const batchReportData = useMemo(() => {
    const mon = getMondayOfWeek(reportWeek, reportWeekYear);
    // Structure: { projName: { totalByDay, workOrders: { woName: { totalByDay, activities: { actName: [7 days] } } } } }
    const projects = {};
    let grandTotal = [0, 0, 0, 0, 0, 0, 0];

    for (let di = 0; di < 7; di++) {
      const d = new Date(mon); d.setDate(d.getDate() + di);
      const entries = getFilteredEntriesForDate(d);
      entries.forEach(ent => {
        const s = parseTime(ent.start), e = parseTime(ent.end);
        if (s === null || e === null) return;
        const hrs = Math.max(0, e - s);
        const projName = ent.project || "(No project)";
        const woName = ent.workOrder || "(No work order)";
        const actName = ent.activity || "(No activity)";
        if (!projects[projName]) projects[projName] = { totalByDay: [0,0,0,0,0,0,0], workOrders: {} };
        if (!projects[projName].workOrders[woName]) projects[projName].workOrders[woName] = { totalByDay: [0,0,0,0,0,0,0], activities: {} };
        if (!projects[projName].workOrders[woName].activities[actName]) projects[projName].workOrders[woName].activities[actName] = [0,0,0,0,0,0,0];
        projects[projName].workOrders[woName].activities[actName][di] += hrs;
        projects[projName].workOrders[woName].totalByDay[di] += hrs;
        projects[projName].totalByDay[di] += hrs;
        grandTotal[di] += hrs;
      });
    }

    const rows = Object.entries(projects).sort((a, b) => a[0].localeCompare(b[0])).map(([projName, pData]) => {
      const projItem = (activeConfig.projects || []).find(p => getItemName(p) === projName);
      const projCode = projItem ? getItemCode(projItem) : "";
      const projLabel = projCode ? `${projCode} — ${projName}` : projName;
      const woRows = Object.entries(pData.workOrders).sort((a, b) => a[0].localeCompare(b[0])).map(([woName, woData]) => {
        const woItem = (activeConfig.workOrders || []).find(w => getItemName(w) === woName);
        const woCode = woItem ? getItemCode(woItem) : "";
        const woLabel = woCode ? `${woCode} — ${woName}` : woName;
        const actRows = Object.entries(woData.activities).sort((a, b) => a[0].localeCompare(b[0])).map(([actName, days]) => ({
          name: actName, days, total: days.reduce((s, h) => s + h, 0)
        }));
        return { name: woLabel, days: woData.totalByDay, total: woData.totalByDay.reduce((s, h) => s + h, 0), activities: actRows };
      });
      return { project: projLabel, projectTotal: pData.totalByDay, workOrders: woRows, total: pData.totalByDay.reduce((s, h) => s + h, 0) };
    });

    return { rows, grandTotal, grandTotalSum: grandTotal.reduce((s, h) => s + h, 0), weekDates: DAYS.map((_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); return d; }) };
  }, [allData, reportWeek, reportWeekYear, activeConfig.projects, activeConfig.workOrders, reportFilterField, reportFilterValues]);

  if (loading) return (
    <div style={{ fontFamily: "'Inter', 'Roboto', sans-serif", minHeight: "100vh", background: "#f1f3f4", color: "#5f6368", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
      Loading...
    </div>
  );

  return (
    <div className={darkMode ? "wht-app wht-dark" : "wht-app"} style={{ fontFamily: "'Inter', 'Roboto', 'Segoe UI', sans-serif", minHeight: "100vh", maxWidth: "100vw", overflowX: "hidden", background: darkMode ? "#1a1a2e" : "#f1f3f4", color: darkMode ? "#e0e0e0" : "#202124", padding: isMobile ? "10px 10px 60px" : "28px 28px 28px", boxSizing: "border-box", transition: "background 0.3s, color 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        select, input { font-family: 'Inter', 'Roboto', sans-serif; }
        select:focus, input:focus { border-color: #1a73e8 !important; box-shadow: 0 0 0 2px rgba(26,115,232,0.15); outline: none; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #bdc1c6; border-radius: 3px; }
        @keyframes timer-breathe { 0%, 100% { opacity: 0.08; } 50% { opacity: 0.18; } }
        @media (max-width: 768px) {
          .wht-grid-2col { grid-template-columns: minmax(0, 1fr) !important; }
          .wht-grid-5col { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .wht-grid-3col { grid-template-columns: minmax(0, 1fr) !important; }
          .wht-grid-4col { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .wht-hide-mobile { display: none !important; }
          .wht-stack-mobile { flex-direction: column !important; align-items: stretch !important; }
          .wht-full-mobile { width: 100% !important; }
          .wht-scroll-x { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .wht-scroll-x::-webkit-scrollbar { height: 4px; }
          input[type="text"], input[type="email"], input[type="password"],
          input[type="number"], input[type="search"], input[type="date"],
          input[type="time"], textarea {
            font-size: 16px !important; /* prevent iOS zoom on focus */
          }
          .wht-small-touch { min-height: 40px; }
          /* Safety: any direct child of the app root must not exceed viewport width */
          img, video, iframe, table, pre { max-width: 100%; }
          /* Prevent long unbreakable strings (URLs, tokens) from pushing layout wide */
          h1, h2, h3, h4, p { overflow-wrap: anywhere; }
        }
        /* Larger touch targets on touch devices */
        @media (hover: none) and (pointer: coarse) {
          button { min-height: 36px; }
        }

        /* ════════════════════════════════════════════════════════════
           DARK MODE OVERRIDES
           Targets inline-styled elements by matching the serialized
           style attribute (browsers normalize hex → rgb() form).
           ════════════════════════════════════════════════════════════ */

        /* Light card / surface backgrounds → dark */
        .wht-dark [style*="background: rgb(255, 255, 255)"],
        .wht-dark [style*="background-color: rgb(255, 255, 255)"],
        .wht-dark [style*="background: #fff"],
        .wht-dark [style*="background:#fff"],
        .wht-dark [style*="background-color: #fff"] {
          background-color: #252538 !important;
        }
        .wht-dark [style*="background: rgb(248, 249, 250)"],
        .wht-dark [style*="background-color: rgb(248, 249, 250)"],
        .wht-dark [style*="background: #f8f9fa"] {
          background-color: #1f1f30 !important;
        }
        .wht-dark [style*="background: rgb(241, 243, 244)"],
        .wht-dark [style*="background-color: rgb(241, 243, 244)"],
        .wht-dark [style*="background: #f1f3f4"] {
          background-color: #1a1a2e !important;
        }
        .wht-dark [style*="background: rgb(232, 234, 237)"],
        .wht-dark [style*="background-color: rgb(232, 234, 237)"],
        .wht-dark [style*="background: #e8eaed"] {
          background-color: #2f2f44 !important;
        }
        .wht-dark [style*="background: rgb(243, 244, 246)"],
        .wht-dark [style*="background: #f3f4f6"] {
          background-color: #20203a !important;
        }
        .wht-dark [style*="background: rgb(250, 251, 252)"],
        .wht-dark [style*="background: #fafbfc"] {
          background-color: #1e1e32 !important;
        }
        /* Light blue pill backgrounds → desaturated dark */
        .wht-dark [style*="background: rgb(232, 240, 254)"],
        .wht-dark [style*="background: #e8f0fe"] {
          background-color: #1e3a5f !important;
        }
        .wht-dark [style*="background: rgb(210, 227, 252)"],
        .wht-dark [style*="background: #d2e3fc"] {
          background-color: #1e3a5f !important;
        }

        /* Dark text colors → light */
        .wht-dark [style*="color: rgb(32, 33, 36)"],
        .wht-dark [style*="color:#202124"],
        .wht-dark [style*="color: #202124"] {
          color: #e8eaed !important;
        }
        .wht-dark [style*="color: rgb(60, 64, 67)"],
        .wht-dark [style*="color: #3c4043"] {
          color: #d4d4d4 !important;
        }
        .wht-dark [style*="color: rgb(95, 99, 104)"],
        .wht-dark [style*="color: #5f6368"] {
          color: #9aa0a6 !important;
        }
        .wht-dark [style*="color: rgb(128, 134, 139)"],
        .wht-dark [style*="color: #80868b"] {
          color: #9aa0a6 !important;
        }

        /* Borders */
        .wht-dark [style*="rgb(218, 220, 224)"],
        .wht-dark [style*="#dadce0"] {
          border-color: #3a3a4e !important;
        }
        .wht-dark [style*="rgb(232, 234, 237)"],
        .wht-dark [style*="#e8eaed"] {
          border-color: #3a3a4e !important;
        }
        .wht-dark [style*="rgb(189, 193, 198)"],
        .wht-dark [style*="#bdc1c6"] {
          border-color: #4a4a5e !important;
        }

        /* Form fields */
        .wht-dark input,
        .wht-dark select,
        .wht-dark textarea {
          background-color: #2a2a3e !important;
          color: #e8eaed !important;
          border-color: #3a3a4e !important;
        }
        .wht-dark input::placeholder,
        .wht-dark textarea::placeholder {
          color: #80868b !important;
        }
        .wht-dark select option {
          background-color: #2a2a3e !important;
          color: #e8eaed !important;
        }

        /* Buttons with light backgrounds */
        .wht-dark button[style*="background: rgb(255, 255, 255)"],
        .wht-dark button[style*="background-color: rgb(255, 255, 255)"] {
          background-color: #2a2a3e !important;
          color: #e8eaed !important;
        }

        /* Tables / rows */
        .wht-dark tr[style*="background: rgb(255, 255, 255)"],
        .wht-dark tr[style*="background: #fff"],
        .wht-dark td[style*="background: rgb(255, 255, 255)"] {
          background-color: #252538 !important;
        }

        /* Scrollbars in dark mode */
        .wht-dark ::-webkit-scrollbar-thumb {
          background: #4a4a5e !important;
        }

        /* Daily quote banner gradient */
        .wht-dark [style*="linear-gradient(135deg, rgb(232, 240, 254)"],
        .wht-dark [style*="linear-gradient(135deg, #e8f0fe"] {
          background: linear-gradient(135deg, #1e3a5f, #2a2450) !important;
        }

        /* Shadow tweaks for better contrast on dark cards */
        .wht-dark [style*="box-shadow: rgba(0, 0, 0, 0.06)"],
        .wht-dark [style*="box-shadow:0 1px 3px rgba(0,0,0,0.06)"] {
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;
        }
      `}</style>

      {/* HEADER */}
      <div style={{ marginBottom: isMobile ? 16 : 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: 12, background: "#1a73e8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontSize: isMobile ? 15 : 18, fontWeight: 700 }}>H</span>
          </div>
          <div style={{ minWidth: 0, flex: isMobile ? 1 : "unset" }}>
            <h1 style={{ fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: isMobile ? 17 : 22, fontWeight: 600, margin: 0, color: darkMode ? "#e0e0e0" : "#202124", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hours Tracker{!isMobile && <span style={{ fontSize: 11, fontWeight: 500, color: "#1a73e8", background: "#e8f0fe", padding: "2px 8px", borderRadius: 8, verticalAlign: "middle", marginLeft: 8 }}>V-Active</span>}</h1>
          </div>
          {saveStatus && <span style={{ marginLeft: isMobile ? 0 : "auto", fontSize: isMobile ? 11 : 13, color: saveStatus === "error" || saveStatus.includes("error") ? "#d93025" : "#34a853", fontWeight: 500 }}>
            {saveStatus === "saved" ? "✓ Saved" : saveStatus === "refreshing..." ? "↻" : saveStatus === "refreshed" ? "✓" : saveStatus === "imported" ? "✓ Imported" : saveStatus === "copied" ? "✓ Copied" : saveStatus.includes("error") ? "⚠" : "✓"}
          </span>}
          {!saveStatus && lastSaved && !isMobile && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#80868b" }}>
              Last saved {lastSaved.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {profilesAvailable && profiles.length > 0 && (
            <select
              value={activeProfileId}
              onChange={e => switchProfile(e.target.value)}
              title="Switch profile"
              disabled={profileSwitching}
              style={{
                marginLeft: (saveStatus || (lastSaved && !isMobile)) ? 8 : "auto",
                fontSize: isMobile ? 12 : 13,
                fontWeight: 600,
                color: "#1a73e8",
                background: "#e8f0fe",
                border: "1px solid #1a73e8",
                padding: isMobile ? "6px 8px" : "6px 12px",
                borderRadius: 8,
                cursor: profileSwitching ? "wait" : "pointer",
                outline: "none",
                maxWidth: isMobile ? 120 : 180,
                flexShrink: 0,
              }}
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button onClick={() => setActiveTab("admin")} title="Admin / Settings" style={{
            background: activeTab === "admin" ? "#e8f0fe" : "transparent",
            border: `1px solid ${activeTab === "admin" ? "#1a73e8" : "#dadce0"}`,
            color: activeTab === "admin" ? "#1a73e8" : "#5f6368",
            padding: isMobile ? "6px 8px" : "6px 10px",
            borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", gap: 4,
            marginLeft: (profilesAvailable && profiles.length > 0) ? 8
              : isMobile ? "auto"
              : (saveStatus || lastSaved ? 8 : "auto"),
            flexShrink: 0,
          }}
            onMouseEnter={e => { if (activeTab !== "admin") e.currentTarget.style.background = "#f1f3f4"; }}
            onMouseLeave={e => { if (activeTab !== "admin") e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button onClick={() => setDarkMode(d => !d)} title={darkMode ? "Light mode" : "Dark mode"} style={{
            background: "transparent", border: "1px solid #dadce0", color: "#5f6368",
            padding: isMobile ? "6px 8px" : "6px 10px",
            borderRadius: 8, cursor: "pointer", fontSize: 14, flexShrink: 0,
          }}>{darkMode ? "☀️" : "🌙"}</button>
        </div>
        {!isMobile && <p style={{ color: "#5f6368", fontSize: 14, margin: 0, marginLeft: 52 }}>Contracted: {standardHours}h/week · Track your work hours, overtime, and projects</p>}
      </div>

      {/* ═══ DAILY QUOTE ═══ */}
      {config.showDailyQuote !== false && quoteDismissed !== dateStr(new Date()) && (() => {
        const dayNum = Math.floor(new Date().getTime() / 86400000);
        const idx = (dayNum + quoteOffset) % DAILY_QUOTES.length;
        const q = DAILY_QUOTES[Math.abs(idx) % DAILY_QUOTES.length];
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", marginBottom: 16,
            background: "linear-gradient(135deg, #e8f0fe, #f3e8fd)", border: "1px solid #d2e3fc",
            borderRadius: 12
          }}>
            <div style={{ fontSize: 22, flexShrink: 0, opacity: 0.7 }}>💡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#202124", fontStyle: "italic", lineHeight: 1.4, fontFamily: "'Inter', 'Roboto', sans-serif" }}>
                "{q.text}"
              </div>
              <div style={{ fontSize: 11, color: "#5f6368", marginTop: 2 }}>— {q.author}</div>
            </div>
            <button onClick={() => setQuoteOffset(o => o + 1)} title="Next quote" style={{
              background: "rgba(255,255,255,0.7)", border: "1px solid #d2e3fc", color: "#1a73e8",
              padding: "4px 10px", borderRadius: 10, cursor: "pointer", fontSize: 11, fontWeight: 600, flexShrink: 0
            }}>Next</button>
            <button onClick={() => setQuoteDismissed(dateStr(new Date()))} title="Close for today" style={{
              background: "transparent", border: "none", color: "#80868b",
              padding: "4px", cursor: "pointer", fontSize: 14, lineHeight: 1, flexShrink: 0
            }}>✕</button>
          </div>
        );
      })()}

      {/* ═══ TIMER ═══ */}
      {timerStatus === "stopped" ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 14, marginBottom: isMobile ? 16 : 24,
          padding: isMobile ? "10px 12px" : "14px 18px", background: "#ffffff", borderRadius: 10, border: "1px solid #dadce0"
        }}>
          {!isMobile && <div style={{ fontSize: 14, color: "#5f6368" }}>Timer</div>}
          <button onClick={startTimer} style={{
            background: "#1a73e8", border: "none", color: "#fff",
            padding: isMobile ? "10px 16px" : "10px 24px",
            borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif",
            fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
            flex: isMobile ? 1 : "unset", justifyContent: "center",
          }}>
            ▶ Start Timer
          </button>
          {!isMobile && <div style={{ fontSize: 14, color: "#5f6368" }}>Track work in real-time</div>}
        </div>
      ) : (
        <div style={{
          marginBottom: isMobile ? 16 : 24, borderRadius: 12, overflow: "visible",
          border: `2px solid ${timerStatus === "running" ? "#1a73e8" : "#1a73e8"}`,
          background: "#ffffff"
        }}>
          {/* Timer header with clock */}
          <div style={{
            display: "flex", alignItems: "center",
            gap: isMobile ? 10 : 18,
            padding: isMobile ? "12px 12px" : "16px 20px",
            flexWrap: isMobile ? "wrap" : "nowrap",
            background: timerStatus === "running" ? "rgba(16, 185, 129, 0.08)" : "rgba(26, 115, 232, 0.08)"
          }}>
            {/* Pulsing dot */}
            <div style={{
              width: 12, height: 12, borderRadius: "50%",
              background: timerStatus === "running" ? "#1a73e8" : "#1a73e8",
              animation: timerStatus === "running" ? "pulse 1.5s ease-in-out infinite" : "none",
              flexShrink: 0
            }} />
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes timer-breathe { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.4; } }`}</style>

            {/* Clock display */}
            <div>
              <div style={{
                fontSize: isMobile ? 28 : 36, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif",
                color: "#1a73e8", letterSpacing: isMobile ? "1px" : "2px", fontVariantNumeric: "tabular-nums"
              }}>
                {formatTimerDisplay(timerElapsed)}
              </div>
              <div style={{ display: "flex", gap: isMobile ? 8 : 14, fontSize: isMobile ? 12 : 14, color: "#5f6368", marginTop: 4, flexWrap: "wrap" }}>
                <span>Started {timerStartStr}</span>
                {timerTotalPaused > 0 || timerPauseStart ? <span>· {formatTimerPaused()}</span> : null}
                {timerStatus === "paused" && <span style={{ color: "#1a73e8", fontWeight: 600 }}>PAUSED</span>}
              </div>
            </div>

            <div style={{ flex: 1 }} />

            {/* Control buttons */}
            <div style={{ display: "flex", gap: isMobile ? 6 : 8, width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "flex-end" : "flex-start" }}>
              {timerStatus === "running" && (
                <button onClick={pauseTimer} style={{
                  background: "#1a73e8", border: "none", color: "#ffffff", padding: "10px 20px",
                  borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif",
                  fontSize: 13, fontWeight: 700
                }}>⏸ Pause</button>
              )}
              {timerStatus === "paused" && (
                <button onClick={resumeTimer} style={{
                  background: "#1a73e8", border: "none", color: "#fff", padding: "10px 20px",
                  borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif",
                  fontSize: 13, fontWeight: 700
                }}>▶ Resume</button>
              )}
              <button onClick={stopTimer} style={{
                background: "#1a73e8", border: "none", color: "#fff", padding: "10px 20px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif",
                fontSize: 13, fontWeight: 700
              }}>⏹ Stop</button>
              <button onClick={discardTimer} style={{
                background: "transparent", border: "1px solid #dadce0", color: "#5f6368", padding: "10px 14px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif",
                fontSize: 13
              }}
                onMouseEnter={e => { e.target.style.borderColor = "#d93025"; e.target.style.color = "#d93025"; }}
                onMouseLeave={e => { e.target.style.borderColor = "#dadce0"; e.target.style.color = "#5f6368"; }}
              >✕</button>
            </div>
          </div>

          {/* Note field — prominent, right below timer */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderTop: "1px solid #e8eaed", background: "#f8f9fa" }}>
            <NoteAutoComplete
              value={timerNote}
              onChange={setTimerNote}
              inputRef={timerNoteRef}
              noteHistory={noteHistory}
              onSelectEntry={entry => {
                if (entry.activity) setTimerActivity(entry.activity);
                if (entry.workOrder) setTimerWorkOrder(entry.workOrder);
                if (entry.project) setTimerProject(entry.project);
                if (entry.customer) setTimerCustomer(entry.customer);
                if (entry.tags && entry.tags.length > 0) setTimerTags(entry.tags);
              }}
            />
            {copiedEntry && (
              <button onClick={pasteIntoTimer} style={{
                background: "#ffffff", border: "1px solid #1a73e8", color: "#1a73e8", padding: "10px 16px",
                borderRadius: 10, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif",
                fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0
              }}>Paste</button>
            )}
          </div>

          {/* Tag fields */}
          <div style={{
            display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10,
            padding: isMobile ? "12px 12px" : "14px 20px", borderTop: "1px solid #dadce0"
          }}>
            <div>
              <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 }}>Work Order</div>
              <FavSel value={timerWorkOrder} onChange={v => {
                setTimerWorkOrder(v);
                if (v) {
                  const chain = lookupWorkOrderChain(v);
                  if (chain.project) setTimerProject(chain.project);
                  if (chain.customer) setTimerCustomer(chain.customer);
                }
              }} options={getItemNames(activeConfig.workOrders)} configItems={activeConfig.workOrders} placeholder="—" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 }}>Activity</div>
              <FavSel value={timerActivity} onChange={setTimerActivity} options={getActivitiesForProject(timerProject)} favouriteNames={config.favouriteActivities || []} placeholder="—" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 }}>Project</div>
              <FavSel value={timerProject} onChange={v => { setTimerProject(v); setTimerWorkOrder(""); }} options={getProjectsForCustomer(timerCustomer)} configItems={activeConfig.projects} placeholder="—" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 }}>Customer</div>
              <FavSel value={timerCustomer} onChange={v => { setTimerCustomer(v); setTimerProject(""); setTimerWorkOrder(""); }} options={getItemNames(activeConfig.customers)} configItems={activeConfig.customers} placeholder="—" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 }}>Tags</div>
              <TagMultiSelect selected={timerTags} onChange={setTimerTags} options={activeConfig.tags} favouriteNames={config.favouriteTags || []} tagCategories={config.tagCategories} />
            </div>
          </div>
        </div>
      )}

      {/* TABS */}
      <div className="wht-scroll-x" style={{
        display: "flex", gap: 0, marginBottom: isMobile ? 18 : 28,
        borderBottom: "1px solid #dadce0",
        overflowX: isMobile ? "auto" : "visible",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        width: "100%", maxWidth: "100%", minWidth: 0,
      }}>
        {[
          ["dashboard", "📊", "Dashboard"],
          ["week", "📅", "Week"],
          ["tasks", "✓", "Tasks"],
          ["reports", "📈", "Reports"],
          ...(isPortfolioManager ? [["portfolio", "👥", "Portfolio"]] : []),
        ].map(([tab, icon, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} title={label} style={{
            fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: isMobile ? 11 : 14, fontWeight: 500,
            textTransform: "capitalize", letterSpacing: "0.25px",
            padding: isMobile ? "8px 2px" : "12px 24px",
            background: "transparent",
            color: activeTab === tab ? "#1a73e8" : "#5f6368",
            border: "none",
            borderBottom: activeTab === tab ? "3px solid #1a73e8" : "3px solid transparent",
            cursor: "pointer",
            transition: "all 0.2s",
            flex: isMobile ? "1 1 0" : "0 0 auto",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: "center", gap: isMobile ? 2 : 6, justifyContent: "center",
          }}>
            <span style={{ fontSize: isMobile ? 18 : 14 }}>{icon}</span>
            <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ═══════ DASHBOARD TAB ═══════ */}
      {activeTab === "dashboard" && (() => {
        const todayS = dateStr(new Date());
        const n = new Date();
        const activeTsk = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
        const overdueTsk = activeTsk.filter(t => t.dueDate && t.dueDate < todayS);
        const dueTodayTsk = activeTsk.filter(t => t.dueDate === todayS || t.doNow);
        const nowTask = activeTsk.find(t => t.doNow);
        const urgentTsk = activeTsk.filter(t => t.urgent);
        const blockedTsk = activeTsk.filter(t => t.blockedBy && activeTsk.some(b => b.id === t.blockedBy && b.status !== "completed"));
        const delegatedTsk = activeTsk.filter(t => t.delegatedTo);
        const todayDi = (n.getDay() + 6) % 7;
        const todayEntries = weekData[todayDi] || [];
        const totalTracked = todayEntries.reduce((s, e) => { const es = parseTime(e.start), ee = parseTime(e.end); return (es !== null && ee !== null) ? s + (ee - es) : s; }, 0);
        const completedThisWeek = tasks.filter(t => t.status === "completed" && t.completedDate && t.completedDate >= dateStr(weekDates[0])).length;
        const weekTotal = weekData.reduce((s, day) => s + (day || []).reduce((ds, e) => { const es = parseTime(e.start), ee = parseTime(e.end); return (es !== null && ee !== null) ? ds + (ee - es) : ds; }, 0), 0);
        const overtime = weekTotal - stdHrs;
        // Time quality
        const tagCats = config.tagCategories || {};
        let goodH = 0, badH = 0, neutralH = 0;
        weekData.forEach(day => (day || []).forEach(e => {
          const s = parseTime(e.start), en = parseTime(e.end);
          if (s === null || en === null) return;
          const hrs = en - s;
          const eTags = e.tags || (e.tag ? [e.tag] : []);
          const cat = eTags.reduce((best, t) => tagCats[t] === "good" ? "good" : tagCats[t] === "bad" && best !== "good" ? "bad" : best, "neutral");
          if (cat === "good") goodH += hrs; else if (cat === "bad") badH += hrs; else neutralH += hrs;
        }));
        return (
          <div>
            <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 700, color: darkMode ? "#e0e0e0" : "#202124", marginBottom: 16, overflowWrap: "anywhere" }}>📊 Dashboard{isMobile ? "" : " — "}{isMobile ? <><br />{n.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</> : n.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>

            {/* Top stats */}
            <div className="wht-grid-5col" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Tracked Today", value: fmtH(totalTracked), color: "#1a73e8" },
                { label: "Week Total", value: fmtH(weekTotal), color: "#5f6368" },
                { label: "Overtime", value: overtime > 0 ? "+" + fmtH(overtime) : fmtH(overtime), color: overtime > 0 ? "#d93025" : "#34a853" },
                { label: "Due Today", value: dueTodayTsk.length, color: dueTodayTsk.length > 0 ? "#e37400" : "#34a853" },
                { label: "Overdue", value: overdueTsk.length, color: overdueTsk.length > 0 ? "#d93025" : "#34a853" },
                { label: "Done This Week", value: completedThisWeek, color: "#34a853" },
              ].map(s => (
                <div key={s.label} style={{ background: darkMode ? "#16213e" : "#fff", border: `1px solid ${darkMode ? "#2a2a4a" : "#e8eaed"}`, borderRadius: 12, padding: "16px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "#80868b", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Time quality bar */}
            {weekTotal > 0 && (
              <div style={{ background: darkMode ? "#16213e" : "#fff", border: `1px solid ${darkMode ? "#2a2a4a" : "#e8eaed"}`, borderRadius: 12, padding: "12px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: darkMode ? "#e0e0e0" : "#202124", marginBottom: 8 }}>📊 Time Quality This Week</div>
                <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", background: "#e8eaed" }}>
                  {goodH > 0 && <div style={{ width: `${(goodH/weekTotal)*100}%`, background: "#34a853" }} title={`Productive: ${fmtH(goodH)}`} />}
                  {neutralH > 0 && <div style={{ width: `${(neutralH/weekTotal)*100}%`, background: "#80868b" }} title={`Unclassified: ${fmtH(neutralH)}`} />}
                  {badH > 0 && <div style={{ width: `${(badH/weekTotal)*100}%`, background: "#d93025" }} title={`Overhead: ${fmtH(badH)}`} />}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12 }}>
                  <span style={{ color: "#34a853" }}>● Productive {fmtH(goodH)} ({weekTotal > 0 ? Math.round(goodH/weekTotal*100) : 0}%)</span>
                  <span style={{ color: "#80868b" }}>● Unclassified {fmtH(neutralH)}</span>
                  <span style={{ color: "#d93025" }}>● Overhead {fmtH(badH)} ({weekTotal > 0 ? Math.round(badH/weekTotal*100) : 0}%)</span>
                </div>
              </div>
            )}

            <div className="wht-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Left: Today's calendar mini */}
              <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#202124", marginBottom: 12 }}>📅 Today's Schedule</div>
                {todayEntries.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>No entries today</div>
                ) : todayEntries.sort((a, b) => (a.start || "").localeCompare(b.start || "")).map(e => (
                  <div key={e.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f3f4", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#1a73e8", width: 90, flexShrink: 0 }}>{e.start}–{e.end}</span>
                    <span style={{ fontSize: 13, color: "#202124", flex: 1 }}>{e.note || "(no note)"}</span>
                    {e.project && <span style={{ fontSize: 11, color: "#80868b" }}>{e.project}</span>}
                  </div>
                ))}
              </div>

              {/* Right: Priority tasks */}
              <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#202124", marginBottom: 12 }}>🎯 Top Priority Tasks</div>
                {nowTask && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fce8e6", borderRadius: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14 }}>🔥</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#d93025" }}>{nowTask.title}</span>
                    {nowTask.duration > 0 && <span style={{ fontSize: 11, color: "#a142f4" }}>{fmtDuration(nowTask.duration)}</span>}
                  </div>
                )}
                {activeTsk.filter(t => !t.doNow).sort((a, b) => (getUrgency(b).score * (b.importance || 1)) - (getUrgency(a).score * (a.importance || 1))).slice(0, 7).map(t => {
                  const urg = getUrgency(t);
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f3f4" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: urg.color + "18", color: urg.color }}>{urg.label}</span>
                      <span style={{ flex: 1, fontSize: 13, color: "#202124" }}>{t.title}</span>
                      {t.delegatedTo && <span style={{ fontSize: 10, color: "#8b5cf6" }}>👤 {t.delegatedTo}</span>}
                      {t.blockedBy && <span style={{ fontSize: 10, color: "#d93025" }}>🚫</span>}
                      <span style={{ fontSize: 11, fontWeight: 600, color: urg.color }}>{(urg.score * (t.importance || 1)).toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Alerts row */}
            {(overdueTsk.length > 0 || blockedTsk.length > 0 || delegatedTsk.length > 0) && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                {overdueTsk.length > 0 && <div style={{ padding: "10px 16px", background: "#fce8e6", borderRadius: 10, fontSize: 13, color: "#d93025", fontWeight: 600 }}>🔴 {overdueTsk.length} overdue</div>}
                {blockedTsk.length > 0 && <div style={{ padding: "10px 16px", background: "#fef7e0", borderRadius: 10, fontSize: 13, color: "#e37400", fontWeight: 600 }}>🚫 {blockedTsk.length} blocked</div>}
                {delegatedTsk.length > 0 && <div style={{ padding: "10px 16px", background: "#f3e8fd", borderRadius: 10, fontSize: 13, color: "#8b5cf6", fontWeight: 600 }}>👤 {delegatedTsk.length} delegated</div>}
              </div>
            )}

            {/* Unaccounted time this week */}
            <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", marginTop: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#202124", marginBottom: 10 }}>⏰ Unaccounted Time This Week</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {weekDates.slice(0, 5).map((d, i) => {
                  const dayEntries = weekData[i] || [];
                  const tracked = dayEntries.reduce((s, e) => { const es = parseTime(e.start), ee = parseTime(e.end); return (es !== null && ee !== null) ? s + (ee - es) : s; }, 0);
                  const expected = dailyHrs;
                  const gap = expected - tracked;
                  const isPast = d < new Date() && dateStr(d) !== todayS;
                  const isToday = dateStr(d) === todayS;
                  return (
                    <div key={i} style={{
                      flex: 1, minWidth: 80, padding: "10px", borderRadius: 8, textAlign: "center",
                      background: gap > 1 && isPast ? "#fce8e6" : gap > 0.5 && isPast ? "#fef7e0" : "#e6f4ea",
                      border: isToday ? "2px solid #1a73e8" : "1px solid #e8eaed"
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#5f6368" }}>{["Mon","Tue","Wed","Thu","Fri"][i]}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: tracked >= expected ? "#34a853" : gap > 1 && isPast ? "#d93025" : "#e37400" }}>{fmtH(tracked)}</div>
                      <div style={{ fontSize: 10, color: "#80868b" }}>/ {fmtH(expected)}</div>
                      {gap > 0.5 && isPast && <div style={{ fontSize: 10, fontWeight: 600, color: "#d93025", marginTop: 2 }}>-{fmtH(gap)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════ WEEK TAB ═══════ */}
      {activeTab === "week" && (
        <>
          {/* Week & day nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 12 : 20, gap: 6 }}>
            <div style={{ display: "flex", gap: isMobile ? 3 : 6, alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <button onClick={() => navWeek(-1)} title="Previous week" style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: isMobile ? "6px 10px" : "8px 14px", borderRadius: 20, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>««</button>
                {!isMobile && <div style={{ fontSize: 10, color: "#80868b", marginTop: 3 }}>Week</div>}
              </div>
              <div style={{ textAlign: "center" }}>
                <button onClick={() => navDay(-1)} title="Previous day" style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: isMobile ? "6px 10px" : "8px 14px", borderRadius: 20, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>«</button>
                {!isMobile && <div style={{ fontSize: 10, color: "#80868b", marginTop: 3 }}>Day</div>}
              </div>
            </div>
            <div style={{ textAlign: "center", minWidth: 0, flex: isMobile ? 1 : "unset" }}>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 600 }}>Week {currentWeek}</div>
              <div style={{ fontSize: isMobile ? 11 : 14, color: "#5f6368", marginTop: 2 }}>{formatDate(weekDates[0])} — {formatDate(weekDates[6])}{!isMobile && ` ${currentYear}`}</div>
            </div>
            <div style={{ display: "flex", gap: isMobile ? 3 : 6, alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <button onClick={() => navDay(1)} title="Next day" style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: isMobile ? "6px 10px" : "8px 14px", borderRadius: 20, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>»</button>
                {!isMobile && <div style={{ fontSize: 10, color: "#80868b", marginTop: 3 }}>Day</div>}
              </div>
              <div style={{ textAlign: "center" }}>
                <button onClick={() => navWeek(1)} title="Next week" style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: isMobile ? "6px 10px" : "8px 14px", borderRadius: 20, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>»»</button>
                {!isMobile && <div style={{ fontSize: 10, color: "#80868b", marginTop: 3 }}>Week</div>}
              </div>
            </div>
          </div>

          {/* Day pills */}
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {SHORT_DAYS.map((d, i) => {
              const hol = isHoliday(weekDates[i]);
              return (
              <button key={d} onClick={() => { setEntryDayIndex(i); setSelectedEntryId(null); }} title={hol || ""} style={{
                flex: 1, fontSize: 13, fontWeight: 600, padding: "7px 0",
                fontFamily: "'Inter', 'Roboto', sans-serif",
                background: entryDayIndex === i ? "#1a73e8" : hol ? "#fce8e6" : (isToday(weekDates[i]) ? "#e8f0fe" : "transparent"),
                color: entryDayIndex === i ? "#f1f3f4" : hol ? "#d93025" : (isToday(weekDates[i]) ? "#1a73e8" : "#5f6368"),
                border: `1px solid ${entryDayIndex === i ? "#1a73e8" : hol ? "#f28b82" : (isToday(weekDates[i]) ? "#1a73e8" : "#dadce0")}`,
                borderRadius: 20, cursor: "pointer", position: "relative"
              }}>
                {d}
                {hol && entryDayIndex !== i && <span style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: "#d93025", border: "1px solid #fff" }} />}
              </button>
              );
            })}
            {(() => {
              const isOnToday = currentWeek === getWeekNumber(now) && currentYear === now.getFullYear() && entryDayIndex === todayIdx;
              return (
                <button onClick={() => {
                  setCurrentWeek(getWeekNumber(now));
                  setCurrentYear(now.getFullYear());
                  setEntryDayIndex(todayIdx);
                  setSelectedEntryId(null);
                }} style={{
                  padding: "7px 18px", fontSize: 13, fontWeight: 700,
                  fontFamily: "'Inter', 'Roboto', sans-serif",
                  background: isOnToday ? "#fff8e1" : "#e37400",
                  color: isOnToday ? "#e37400" : "#ffffff",
                  border: `2px solid #e37400`,
                  borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap",
                  boxShadow: isOnToday ? "none" : "0 2px 6px rgba(227,116,0,0.3)"
                }}>Today</button>
              );
            })()}
          </div>

          {/* Calendar + Side panel */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : (calendarView === "week" ? "1fr 280px" : "1fr 300px"), gap: isMobile ? 12 : 20, marginBottom: 24 }}>
            {/* Calendar */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Inter', 'Roboto', sans-serif" }}>
                    {(calendarView === "day" || isMobile) ? formatDateLong(weekDates[entryDayIndex]) : `Week ${currentWeek}`}
                    {(calendarView === "day" || isMobile) && isHoliday(weekDates[entryDayIndex]) && (
                      <span style={{ fontSize: 13, color: "#d93025", fontWeight: 500, marginLeft: 10 }}>🏴 {isHoliday(weekDates[entryDayIndex])}</span>
                    )}
                  </div>
                  {!isMobile && <div style={{ display: "flex", gap: 2, background: "#f1f3f4", borderRadius: 8, padding: 2 }}>
                    {[["day","Day"],["week","Week"]].map(([k,l]) => (
                      <button key={k} onClick={() => setCalendarView(k)} style={{
                        fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600, padding: "4px 12px",
                        background: calendarView === k ? "#ffffff" : "transparent",
                        color: calendarView === k ? "#1a73e8" : "#5f6368",
                        border: "none", borderRadius: 6, cursor: "pointer",
                        boxShadow: calendarView === k ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                      }}>{l}</button>
                    ))}
                  </div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {copiedEntry && (
                    <button onClick={pasteEntry} style={{
                      background: "#ffffff", border: "1px solid #1a73e8", color: "#1a73e8", padding: "6px 14px",
                      borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600
                    }}>Paste</button>
                  )}
                  <button onClick={() => addEntry(entryDayIndex, "09:00", "10:00")} style={{
                    background: "#1a73e8", border: "none", color: "#ffffff", padding: "6px 14px",
                    borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 700
                  }}>+ Add Block</button>
                </div>
              </div>
              {/* Scheduling banner */}
              {schedulingTask && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", marginBottom: 8,
                  background: "#e8f0fe", border: "2px solid #1a73e8", borderRadius: 10
                }}>
                  <span style={{ fontSize: 18 }}>📅</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8" }}>Scheduling: {schedulingTask.title}</div>
                    <div style={{ fontSize: 12, color: "#5f6368" }}>Click a time slot on the calendar to place this task{schedulingTask.duration ? ` (${fmtDuration(schedulingTask.duration)})` : ""}</div>
                  </div>
                  <button onClick={() => setSchedulingTask(null)} style={{
                    background: "#ffffff", border: "1px solid #dadce0", color: "#5f6368", padding: "5px 14px",
                    borderRadius: 16, cursor: "pointer", fontSize: 12, fontWeight: 600
                  }}>Cancel</button>
                </div>
              )}
              {calendarView === "day" || isMobile ? (
                <div style={{ position: "relative" }}>
                  <div style={{ height: CAL_VIEW_H, overflow: "hidden", borderRadius: 10 }}>
                    <div style={{ transform: `translateY(${-calScroll * HOUR_H}px)` }}>
                      <DayCalendar
                        entries={dayEntries}
                        selected={selectedEntryId}
                        onSelect={setSelectedEntryId}
                        onUpdateEntry={updateEntry}
                        onMoveEntry={(id, start, end) => updateEntryFields(id, { start, end })}
                        onAddEntry={(s, e) => addEntry(entryDayIndex, s, e)}
                        onDelete={deleteEntry}
                        workStart={defaults.startTime}
                        workEnd={defaults.endTime}
                        liveTimer={timerStatus !== "stopped" && !timerEntryId && timerStartTime && timerLiveEnd && (() => {
                          const timerDayIdx = (timerStartTime.getDay() + 6) % 7;
                          const timerWeek = getWeekNumber(timerStartTime);
                          const timerYear = timerStartTime.getFullYear();
                          if (timerWeek === currentWeek && timerYear === currentYear && timerDayIdx === entryDayIndex) {
                            return { start: timerStartStr, end: timerLiveEnd, note: timerNote };
                          }
                          return null;
                        })()}
                        showNowLine={isToday(weekDates[entryDayIndex])}
                      />
                    </div>
                  </div>
                  {/* Scroll up */}
                  {calScroll > 0 && (
                    <button onClick={() => setCalScroll(s => Math.max(0, s - 2))}
                      style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", zIndex: 10,
                        width: 36, height: 22, borderRadius: 12, border: "1px solid #dadce0", background: "rgba(255,255,255,0.9)",
                        color: "#5f6368", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>▲</button>
                  )}
                  {/* Scroll down */}
                  {calScroll < CAL_END - CAL_VIEW_HOURS && (
                    <button onClick={() => setCalScroll(s => Math.min(CAL_END - CAL_VIEW_HOURS, s + 2))}
                      style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", zIndex: 10,
                        width: 36, height: 22, borderRadius: 12, border: "1px solid #dadce0", background: "rgba(255,255,255,0.9)",
                        color: "#5f6368", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>▼</button>
                  )}
                </div>
              ) : (
                /* ═══ WEEK CALENDAR VIEW ═══ */
                <div style={{ position: "relative" }}>
                  <div style={{ background: "#ffffff", borderRadius: 10, border: "1px solid #dadce0", overflow: "hidden" }}>
                  {/* Day column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "44px repeat(7, 1fr)", borderBottom: "2px solid #dadce0" }}>
                    <div />
                    {SHORT_DAYS.map((d, i) => {
                      const hol = isHoliday(weekDates[i]);
                      return (
                      <div key={d} onClick={() => { setEntryDayIndex(i); setCalendarView("day"); }}
                        title={hol || ""}
                        style={{
                          textAlign: "center", padding: "8px 2px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          color: hol ? "#d93025" : isToday(weekDates[i]) ? "#1a73e8" : "#5f6368",
                          background: hol ? "#fce8e6" : isToday(weekDates[i]) ? "#e8f0fe" : "transparent",
                          borderLeft: "1px solid #e8eaed"
                        }}>
                        <div>{d}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: hol ? "#d93025" : isToday(weekDates[i]) ? "#1a73e8" : "#202124" }}>{weekDates[i].getDate()}</div>
                        {hol && <div style={{ fontSize: 8, color: "#d93025", lineHeight: 1, marginTop: 1 }}>🏴</div>}
                      </div>
                      );
                    })}
                  </div>
                  {/* Time grid — scrollable */}
                  <div style={{ height: CAL_VIEW_H, overflow: "hidden" }}>
                    <div style={{ position: "relative", height: CAL_H, transform: `translateY(${-calScroll * HOUR_H}px)` }}>
                    {/* Hour lines */}
                    {Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i).map(h => (
                      <div key={h} style={{ position: "absolute", top: (h - CAL_START) * HOUR_H, left: 0, right: 0, display: "flex", alignItems: "center", zIndex: 1 }}>
                        <div style={{ width: 40, textAlign: "right", paddingRight: 6, fontSize: 10, color: "#80868b" }}>{h.toString().padStart(2, "0")}:00</div>
                        <div style={{ flex: 1, height: 1, background: "#e8eaed" }} />
                      </div>
                    ))}
                    {/* Half-hour lines */}
                    {Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i).filter(h => h < CAL_END).map(h => (
                      <div key={`h30-${h}`} style={{ position: "absolute", top: (h - CAL_START + 0.5) * HOUR_H, left: 44, right: 0, height: 1, background: "#f4f4f4", zIndex: 1 }} />
                    ))}
                    {/* Current time line */}
                    {(() => {
                      const n = new Date();
                      const nowH = n.getHours() + n.getMinutes() / 60;
                      const todayDi = weekDates.findIndex(d => d.toDateString() === n.toDateString());
                      if (todayDi < 0 || nowH < CAL_START || nowH > CAL_END) return null;
                      const top = (nowH - CAL_START) * HOUR_H;
                      // Position line across the today column
                      const leftPct = (todayDi / 7) * 100;
                      const widthPct = (1 / 7) * 100;
                      return (
                        <div style={{ position: "absolute", top, left: 44, right: 0, zIndex: 8, pointerEvents: "none" }}>
                          <div style={{ position: "relative", height: 0 }}>
                            <div style={{ position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, display: "flex", alignItems: "center" }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d93025", flexShrink: 0 }} />
                              <div style={{ flex: 1, height: 2, background: "#d93025" }} />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Day columns with blocks */}
                    <div style={{ position: "absolute", top: 0, left: 44, right: 0, bottom: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                      {weekData.map((dayEntries, di) => {
                        const timerOnThisDay = timerStatus !== "stopped" && !timerEntryId && timerStartTime && timerLiveEnd && (() => {
                          const timerDayIdx = (timerStartTime.getDay() + 6) % 7;
                          const timerWeek = getWeekNumber(timerStartTime);
                          return timerWeek === currentWeek && timerStartTime.getFullYear() === currentYear && timerDayIdx === di;
                        })();
                        return (
                        <div key={di} style={{ position: "relative", borderLeft: "1px solid #e8eaed" }}
                          onClick={() => { setEntryDayIndex(di); }}>
                          {dayEntries.map((ent, ei) => {
                            const s = parseTime(ent.start), en = parseTime(ent.end);
                            if (s === null || en === null) return null;
                            const col = BLOCK_COLORS[ei % BLOCK_COLORS.length];
                            const isSel = selectedEntryId === ent.id;
                            const top = (s - CAL_START) * HOUR_H;
                            const height = Math.max((en - s) * HOUR_H, 8);
                            return (
                              <div key={ent.id}
                                onClick={e => { e.stopPropagation(); setSelectedEntryId(ent.id); setEntryDayIndex(di); }}
                                style={{
                                  position: "absolute", left: 2, right: 2, top, height,
                                  background: isSel ? `${col}40` : `${col}20`,
                                  borderLeft: `3px solid ${col}`, borderRadius: "0 4px 4px 0",
                                  overflow: "hidden", cursor: "pointer", zIndex: isSel ? 4 : 2,
                                  outline: isSel ? `2px solid ${col}` : "none", outlineOffset: 1,
                                  padding: "2px 4px"
                                }}>
                                <div style={{
                                  fontSize: 10, fontWeight: 700, color: "#202124", lineHeight: 1.2,
                                  overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                                  background: "rgba(255,255,255,0.85)", borderRadius: 2, padding: "0 2px", display: "inline-block", maxWidth: "100%"
                                }}>
                                  {ent.recurring ? "🔄 " : ""}{ent.note || fmtH(en - s) + "h"}
                                </div>
                                {height > 24 && (
                                  <div style={{ fontSize: 9, color: "#5f6368", marginTop: 1 }}>
                                    {ent.start}–{ent.end}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {/* Live timer block in week view */}
                          {timerOnThisDay && (() => {
                            const s = parseTime(timerStartStr);
                            if (s === null) return null;
                            const top = (s - CAL_START) * HOUR_H;
                            const height = Math.max((timerLiveEnd - s) * HOUR_H, 8);
                            return (
                              <div style={{
                                position: "absolute", left: 2, right: 2, top, height,
                                borderLeft: "3px solid #1a73e8",
                                borderRadius: "0 4px 4px 0", zIndex: 1,
                                outline: "2px dashed #1a73e8", outlineOffset: -1,
                                pointerEvents: "none", overflow: "hidden",
                                display: "flex", alignItems: "center", justifyContent: "center"
                              }}>
                                <div style={{
                                  position: "absolute", inset: 0,
                                  background: "#1a73e8",
                                  animation: "timer-breathe 3s ease-in-out infinite"
                                }} />
                                <div style={{ fontSize: 9, fontWeight: 700, color: "#1a73e8", background: "rgba(255,255,255,0.9)", padding: "0 3px", borderRadius: 2, position: "relative", zIndex: 2 }}>⏱</div>
                              </div>
                            );
                          })()}
                        </div>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                  </div>
                  {/* Scroll up */}
                  {calScroll > 0 && (
                    <button onClick={() => setCalScroll(s => Math.max(0, s - 2))}
                      style={{ position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)", zIndex: 10,
                        width: 36, height: 22, borderRadius: 12, border: "1px solid #dadce0", background: "rgba(255,255,255,0.9)",
                        color: "#5f6368", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>▲</button>
                  )}
                  {/* Scroll down */}
                  {calScroll < CAL_END - CAL_VIEW_HOURS && (
                    <button onClick={() => setCalScroll(s => Math.min(CAL_END - CAL_VIEW_HOURS, s + 2))}
                      style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", zIndex: 10,
                        width: 36, height: 22, borderRadius: 12, border: "1px solid #dadce0", background: "rgba(255,255,255,0.9)",
                        color: "#5f6368", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>▼</button>
                  )}
                </div>
              )}
            </div>

            {/* Side panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              {selectedEntry ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontSize: 13, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>Edit Block</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {copiedEntry && (
                        <button onClick={pasteIntoSelected} style={{
                          background: "#ffffff", border: "1px solid #1a73e8", color: "#1a73e8",
                          padding: "3px 12px", borderRadius: 12, cursor: "pointer",
                          fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                        }}>Paste</button>
                      )}
                      <button onClick={() => { copyEntry(selectedEntryId); }} style={{
                        background: copiedEntry && copiedEntry.id === selectedEntryId ? "#e8f0fe" : "#f1f3f4",
                        border: `1px solid ${copiedEntry && copiedEntry.id === selectedEntryId ? "#1a73e8" : "#dadce0"}`,
                        color: copiedEntry && copiedEntry.id === selectedEntryId ? "#1a73e8" : "#5f6368",
                        padding: "3px 12px", borderRadius: 12, cursor: "pointer",
                        fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                      }}>{copiedEntry && copiedEntry.id === selectedEntryId ? "✓ Copied" : "Copy"}</button>
                      {timerStatus === "stopped" && (
                        <button onClick={() => {
                          // Start timer from this entry — keep entry and extend it
                          setTimerNote(selectedEntry.note || "");
                          setTimerCustomer(selectedEntry.customer || "");
                          setTimerProject(selectedEntry.project || "");
                          setTimerWorkOrder(selectedEntry.workOrder || "");
                          setTimerActivity(selectedEntry.activity || "");
                          setTimerTags(selectedEntry.tags || []);
                          setTimerStartStr(selectedEntry.start);
                          setTimerStartTime(new Date());
                          setTimerElapsed(0);
                          setTimerTotalPaused(0);
                          setTimerPauseStart(null);
                          setTimerEntryId(selectedEntryId);
                          setTimerStatus("running");
                        }} style={{
                          background: "#34a853", border: "none", color: "#fff",
                          padding: "3px 12px", borderRadius: 12, cursor: "pointer",
                          fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 700
                        }}>▶ Timer</button>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>START</div>
                    <TimeSel value={selectedEntry.start} onChange={v => updateEntry(selectedEntryId, "start", v)} large />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>END</div>
                    <TimeSel value={selectedEntry.end} onChange={v => updateEntry(selectedEntryId, "end", v)} large />
                  </div>
                  <div style={{ height: 1, background: "#dadce0", margin: "4px 0" }} />
                  <div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>NOTE</div>
                    <NoteAutoComplete
                      value={selectedEntry.note || ""}
                      onChange={v => updateEntry(selectedEntryId, "note", v)}
                      inputRef={noteRef}
                      noteHistory={noteHistory}
                      isTextarea
                      onSelectEntry={entry => {
                        updateEntryFields(selectedEntryId, {
                          note: entry.note,
                          ...(entry.activity ? { activity: entry.activity } : {}),
                          ...(entry.workOrder ? { workOrder: entry.workOrder } : {}),
                          ...(entry.project ? { project: entry.project } : {}),
                          ...(entry.customer ? { customer: entry.customer } : {}),
                          ...(entry.billRate ? { billRate: entry.billRate } : {}),
                          ...(entry.tags && entry.tags.length > 0 ? { tags: entry.tags } : {})
                        });
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>WORK ORDER</div>
                    <FavSel value={selectedEntry.workOrder} onChange={v => {
                      if (v) {
                        const chain = lookupWorkOrderChain(v);
                        updateEntryFields(selectedEntryId, {
                          workOrder: v,
                          ...(chain.project ? { project: chain.project } : {}),
                          ...(chain.customer ? { customer: chain.customer } : {})
                        });
                      } else {
                        updateEntry(selectedEntryId, "workOrder", v);
                      }
                    }} options={getItemNames(activeConfig.workOrders)} configItems={activeConfig.workOrders} placeholder="— Select —" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>ACTIVITY</div>
                    <FavSel value={selectedEntry.activity} onChange={v => updateEntry(selectedEntryId, "activity", v)} options={getActivitiesForProject(selectedEntry.project)} favouriteNames={config.favouriteActivities || []} placeholder="— Select —" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>PROJECT</div>
                    <FavSel value={selectedEntry.project} onChange={v => {
                      updateEntryFields(selectedEntryId, { project: v, workOrder: "" });
                    }} options={getProjectsForCustomer(selectedEntry.customer)} configItems={activeConfig.projects} placeholder="— Select —" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>CUSTOMER</div>
                    <FavSel value={selectedEntry.customer} onChange={v => {
                      updateEntryFields(selectedEntryId, { customer: v, project: "", workOrder: "" });
                    }} options={getItemNames(activeConfig.customers)} configItems={activeConfig.customers} placeholder="— Select —" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>TAGS</div>
                    <TagMultiSelect
                      selected={selectedEntry.tags || (selectedEntry.tag ? [selectedEntry.tag] : [])}
                      onChange={v => updateEntryFields(selectedEntryId, { tags: v, tag: undefined })}
                      options={activeConfig.tags}
                      favouriteNames={config.favouriteTags || []}
                      tagCategories={config.tagCategories}
                    />
                  </div>
                  {/* Recurring */}
                  <div style={{ padding: "10px 0", borderTop: "1px solid #e8eaed" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: selectedEntry.recurring ? 8 : 0 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "#202124" }}>
                        <input type="checkbox" checked={!!selectedEntry.recurring}
                          onChange={e => updateEntryFields(selectedEntryId, {
                            recurring: e.target.checked,
                            recurFrequency: e.target.checked ? (selectedEntry.recurFrequency || "weekly") : "",
                            recurId: e.target.checked ? (selectedEntry.recurId || selectedEntryId) : "",
                            recurApplied: false
                          })}
                          style={{ accentColor: "#1a73e8", width: 16, height: 16, cursor: "pointer" }} />
                        Recurring
                      </label>
                      {selectedEntry.recurring && selectedEntry.recurApplied && (
                        <span style={{ fontSize: 11, color: "#34a853", fontWeight: 600 }}>✓ Applied</span>
                      )}
                      {selectedEntry.recurring && !selectedEntry.recurApplied && (
                        <span style={{ fontSize: 11, color: "#e37400", fontWeight: 600 }}>Not applied</span>
                      )}
                    </div>
                    {selectedEntry.recurring && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {[["daily", "Daily"], ["weekly", "Weekly"], ["biweekly", "Bi-weekly"], ["monthly", "Monthly"]].map(([k, l]) => (
                            <button key={k} onClick={() => {
                              const updates = { recurFrequency: k, recurApplied: false };
                              if (k === "daily" && !(selectedEntry.recurDays && selectedEntry.recurDays.length > 0)) {
                                updates.recurDays = [0, 1, 2, 3, 4];
                              }
                              updateEntryFields(selectedEntryId, updates);
                            }} style={{
                              fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, padding: "5px 12px",
                              background: selectedEntry.recurFrequency === k ? "#1a73e8" : "#ffffff",
                              color: selectedEntry.recurFrequency === k ? "#fff" : "#5f6368",
                              border: `1px solid ${selectedEntry.recurFrequency === k ? "#1a73e8" : "#dadce0"}`,
                              borderRadius: 16, cursor: "pointer"
                            }}>{l}</button>
                          ))}
                        </div>
                        {selectedEntry.recurFrequency === "daily" && (
                          <div style={{ display: "flex", gap: 4 }}>
                            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => {
                              const days = selectedEntry.recurDays || [0, 1, 2, 3, 4];
                              const active = days.includes(i);
                              return (
                                <button key={d} onClick={() => {
                                  const newDays = active ? days.filter(x => x !== i) : [...days, i].sort();
                                  if (newDays.length > 0) updateEntryFields(selectedEntryId, { recurDays: newDays, recurApplied: false });
                                }} style={{
                                  fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, padding: "5px 10px",
                                  background: active ? "#1a73e8" : "#ffffff",
                                  color: active ? "#fff" : "#5f6368",
                                  border: `1px solid ${active ? "#1a73e8" : "#dadce0"}`,
                                  borderRadius: 6, cursor: "pointer", minWidth: 40, fontWeight: 600
                                }}>{d}</button>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, color: "#5f6368" }}>Until</span>
                          <input type="date"
                            value={selectedEntry.recurUntil || ""}
                            onChange={e => updateEntry(selectedEntryId, "recurUntil", e.target.value)}
                            style={{
                              background: "#ffffff", border: "1px solid #dadce0", color: selectedEntry.recurUntil ? "#202124" : "#80868b",
                              padding: "5px 10px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif",
                              fontSize: 13, outline: "none", cursor: "pointer"
                            }}
                          />
                          {selectedEntry.recurUntil && (
                            <button onClick={() => updateEntry(selectedEntryId, "recurUntil", "")} style={{
                              background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "4px 10px",
                              borderRadius: 4, cursor: "pointer", fontSize: 12
                            }}>Clear</button>
                          )}
                          {!selectedEntry.recurUntil && (
                            <span style={{ fontSize: 11, color: "#80868b" }}>No end date (repeats forever)</span>
                          )}
                        </div>
                        {/* Apply recurrence button */}
                        {!selectedEntry.recurApplied && (
                          <button onClick={() => updateEntryFields(selectedEntryId, { recurApplied: true })} style={{
                            background: "#34a853", border: "none", color: "#ffffff", padding: "9px 16px",
                            borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif",
                            fontSize: 13, fontWeight: 700, width: "100%"
                          }}>Apply recurrence</button>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: "1px solid #dadce0" }}>
                    {/* Apply to all / Detach for recurring entries */}
                    {selectedEntry.recurring && selectedEntry.recurId && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => applyToAllFuture(selectedEntryId)} style={{
                          flex: 1, background: "#e8f0fe", border: "1px solid #1a73e8", color: "#1a73e8", padding: "7px 10px",
                          borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                        }}>Apply to all future</button>
                        <button onClick={() => detachFromRecurrence(selectedEntryId)} style={{
                          background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "7px 10px",
                          borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                        }}>Detach</button>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#5f6368" }}>BLOCK HOURS</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#1a73e8" }}>
                          {fmtH(Math.max(0, (parseTime(selectedEntry.end) || 0) - (parseTime(selectedEntry.start) || 0)))}
                        </div>
                      </div>
                      {/* Delete button — recurring gets prompt */}
                      {recurPrompt && recurPrompt.entryId === selectedEntryId ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                          <div style={{ fontSize: 12, color: "#5f6368", fontWeight: 600 }}>Delete which?</div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => { deleteEntry(selectedEntryId); setRecurPrompt(null); }} style={{
                              background: "#fff", border: "1px solid #d93025", color: "#d93025", padding: "5px 10px",
                              borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600
                            }}>This only</button>
                            <button onClick={() => { deleteAllFuture(selectedEntryId); setRecurPrompt(null); }} style={{
                              background: "#d93025", border: "1px solid #d93025", color: "#fff", padding: "5px 10px",
                              borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600
                            }}>All future</button>
                            <button onClick={() => setRecurPrompt(null)} style={{
                              background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "5px 8px",
                              borderRadius: 6, cursor: "pointer", fontSize: 11
                            }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => {
                          if (selectedEntry.recurring && selectedEntry.recurId) {
                            setRecurPrompt({ type: "delete", entryId: selectedEntryId });
                          } else {
                            deleteEntry(selectedEntryId);
                          }
                        }} style={{
                          background: "transparent", border: "1px solid #d93025", color: "#d93025", padding: "6px 12px",
                          borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12
                        }}>Delete</button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, color: "#80868b" }}>
                  <div style={{ fontSize: 32, opacity: 0.3 }}>◎</div>
                  <div style={{ fontSize: 14, textAlign: "center" }}>Select a block on the timeline or click "+ Add Block"</div>
                  <div style={{ fontSize: 13, color: "#80868b", textAlign: "center" }}>Click empty space on the timeline to add a block there</div>
                  {copiedEntry && (
                    <button onClick={pasteEntry} style={{
                      background: "#1a73e8", border: "none", color: "#ffffff", padding: "8px 20px",
                      borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, marginTop: 4
                    }}>Paste "{copiedEntry.note || "entry"}"</button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Week summary strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: isMobile ? 2 : 4, marginBottom: 18 }}>
            {DAYS.map((_, i) => {
              const hol = isHoliday(weekDates[i]);
              return (
              <div key={i} onClick={() => { setEntryDayIndex(i); setSelectedEntryId(null); }} title={hol || ""} style={{
                textAlign: "center", padding: isMobile ? "6px 2px" : "10px 4px",
                minWidth: 0, overflow: "hidden",
                background: hol ? "#fce8e6" : entryDayIndex === i ? "#e8f0fe" : "#ffffff",
                border: `1px solid ${hol ? "#f28b82" : entryDayIndex === i ? "#1a73e8" : "#dadce0"}`,
                borderRadius: isMobile ? 10 : 20, cursor: "pointer"
              }}>
                <div style={{ fontSize: isMobile ? 11 : 13, color: hol ? "#d93025" : entryDayIndex === i ? "#1a73e8" : "#80868b", marginBottom: isMobile ? 2 : 4 }}>
                  {SHORT_DAYS[i]}{!isMobile && " "}{hol ? "🏴" : ""}
                </div>
                <div style={{ fontSize: isMobile ? 13 : 16, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: dailyHours[i] > 0 ? "#202124" : "#dadce0" }}>
                  {dailyHours[i] > 0 ? fmtH(dailyHours[i]) : "—"}
                </div>
                {!isMobile && <div style={{ fontSize: 12, color: "#5f6368", marginTop: 2 }}>{(weekData[i] || []).length} block{(weekData[i] || []).length !== 1 ? "s" : ""}</div>}
              </div>
              );
            })}
          </div>

          {/* Weekly totals */}
          {(() => {
            const mon = getMondayOfWeek(currentWeek, currentYear);
            const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
            const holCount = countHolidaysInRange(mon, sun);
            const weekContracted = stdHrs - (holCount * dailyHrs);
            const weekOT = weeklyTotal - weekContracted;
            return (
            <div className="wht-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Weekly Total</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{fmtH(weeklyTotal)}</div>
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Contracted</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#5f6368" }}>{fmtH(weekContracted)}</div>
                {holCount > 0 && <div style={{ fontSize: 11, color: "#d93025", marginTop: 4 }}>−{fmtH(holCount * dailyHrs)}h ({holCount} bank hol.)</div>}
              </div>
              <div style={{ background: weekOT > 0 ? "#e8f0fe" : "#ffffff", border: `1px solid ${weekOT > 0 ? "#1a73e8" : "#dadce0"}`, borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Overtime</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: weekOT > 0 ? "#1a73e8" : "#5f6368" }}>
                  {weeklyTotal > 0 ? fmtH(weekOT) : "—"}
                </div>
              </div>
            </div>
            );
          })()}
        </>
      )}

      {/* ═══════ TASKS TAB ═══════ */}
      {activeTab === "tasks" && (
        <div>
          {/* View toggle */}
          <div className="wht-scroll-x" style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", overflowX: isMobile ? "auto" : "visible", flexWrap: isMobile ? "nowrap" : "wrap" }}>
            <div className="wht-scroll-x" style={{ display: "flex", gap: 3, background: "#f1f3f4", borderRadius: 10, padding: 3, overflowX: isMobile ? "auto" : "visible", flexShrink: 0 }}>
              {[["list", "📋 List"], ["kanban", "🗂 Kanban"], ["myday", "☀️ My Day"], ["schedule", "🗓 Schedule"], ["planning", "📆 Plan Week"], ["taskreports", "📊 Reports"]].map(([k, l]) => (
                <button key={k} onClick={() => { setTaskView(k); setReviewMode(false); }} style={{
                  fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, padding: "8px 20px",
                  background: taskView === k && !reviewMode ? "#ffffff" : "transparent", color: taskView === k && !reviewMode ? "#202124" : "#5f6368",
                  border: "none", borderRadius: 8, cursor: "pointer", boxShadow: taskView === k && !reviewMode ? "0 1px 3px rgba(0,0,0,0.12)" : "none"
                }}>{l}</button>
              ))}
            </div>
            {!reviewMode ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <button onClick={() => setReviewFilter(reviewFilter ? null : "show")} style={{
                  fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 700, padding: "8px 20px",
                  background: "#ffffff", color: "#1a73e8",
                  border: "2px solid #1a73e8", borderRadius: 20, cursor: "pointer"
                }}>🔍 Review Tasks ▾</button>
                {reviewFilter === "show" && (
                  <>
                  <div onClick={() => setReviewFilter(null)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 20,
                    background: "#fff", border: "1px solid #dadce0", borderRadius: 10, padding: "6px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)", minWidth: 180
                  }}>
                    {(() => {
                      const active = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled");
                      const todayS = dateStr(new Date());
                      return [
                        { key: "all", label: "📋 All Tasks", filter: t => true },
                        { key: "overdue", label: "🔴 Overdue", filter: t => t.dueDate && t.dueDate < todayS },
                        { key: "onhold", label: "⏸ On Hold", filter: t => t.status === "on_hold" },
                        { key: "nodue", label: "📅 No Due Date", filter: t => !t.dueDate },
                        { key: "nodur", label: "⏱ No Duration", filter: t => !t.duration },
                      ].map(opt => {
                        const count = active.filter(opt.filter).length;
                        const empty = count === 0;
                        return (
                          <button key={opt.key} disabled={empty} onClick={() => {
                            if (empty) return;
                            const ids = active.filter(opt.filter)
                              .sort((a, b) => (getUrgency(b).score * (b.importance || 1)) - (getUrgency(a).score * (a.importance || 1)))
                              .map(t => t.id);
                            setReviewTaskIds(ids);
                            setReviewIndex(0);
                            setReviewConfirm(null);
                            setReviewMode(true);
                            setReviewFilter(null);
                          }} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                            textAlign: "left", background: "transparent",
                            border: "none", padding: "8px 12px", borderRadius: 6,
                            cursor: empty ? "default" : "pointer", opacity: empty ? 0.4 : 1,
                            fontSize: 13, fontWeight: 500, color: empty ? "#80868b" : "#202124",
                            fontFamily: "'Inter', 'Roboto', sans-serif"
                          }}
                            onMouseEnter={e => { if (!empty) e.currentTarget.style.background = "#f1f3f4"; }}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <span>{opt.label}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: empty ? "#bdc1c6" : count > 0 ? "#1a73e8" : "#80868b",
                              background: empty ? "transparent" : "#e8f0fe", padding: "1px 8px", borderRadius: 10,
                              minWidth: 20, textAlign: "center"
                            }}>{count}</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                  </>
                )}
              </div>
            ) : (
              <button onClick={() => setReviewMode(false)} style={{
                fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 700, padding: "8px 20px",
                background: "#1a73e8", color: "#fff",
                border: "2px solid #1a73e8", borderRadius: 20, cursor: "pointer"
              }}>🔍 Exit Review</button>
            )}
          </div>

          {/* ═══ REVIEW MODE ═══ */}
          {reviewMode && (() => {
            // Filter out any IDs that were completed/cancelled/deleted during this review
            const activeIds = reviewTaskIds.filter(id => tasks.some(t => t.id === id && t.status !== "completed" && t.status !== "cancelled"));
            if (activeIds.length === 0) return (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 16, border: "1px solid #dadce0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#202124" }}>All tasks reviewed!</div>
                <button onClick={() => setReviewMode(false)} style={{ marginTop: 16, background: "#1a73e8", border: "none", color: "#fff", padding: "10px 28px", borderRadius: 20, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Done</button>
              </div>
            );
            const idx = Math.min(reviewIndex, activeIds.length - 1);
            const task = tasks.find(t => t.id === activeIds[idx]);
            if (!task) { setReviewMode(false); return null; }
            const urg = getUrgency(task);
            const pri = (urg.score * (task.importance || 1)).toFixed(1);
            const URGENCY_LEVELS = [
              { key: "now", label: "🔥 Now", color: "#d93025" },
              { key: "urgent", label: "⚠️ Urgent", color: "#c5221f" },
              { key: "today", label: "Today", color: "#ea4335" },
              { key: "tomorrow", label: "Tomorrow", color: "#e37400" },
              { key: "thisweek", label: "This Week", color: "#1a73e8" },
              { key: "nextweek", label: "Next Week", color: "#4285f4" },
              { key: "thismonth", label: "This Month", color: "#34a853" },
              { key: "anytime", label: "Anytime", color: "#80868b" }
            ];
            const currentLevel = task.doNow ? "now" : task.urgent ? "urgent" : (() => {
              if (!task.dueDate) return "anytime";
              const t = new Date(); t.setHours(0,0,0,0);
              const d = new Date(task.dueDate + "T00:00:00");
              const diff = Math.ceil((d - t) / 86400000);
              if (diff <= 0) return "today";
              if (diff === 1) return "tomorrow";
              if (diff <= 5) return "thisweek";
              if (diff <= 12) return "nextweek";
              if (diff <= 31) return "thismonth";
              return "anytime";
            })();

            return (
              <div style={{
                background: "#ffffff", border: "1px solid #dadce0", borderRadius: 16, padding: "32px 36px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)", maxWidth: 640, margin: "0 auto"
              }}>
                {/* Progress */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: "#5f6368", fontWeight: 600 }}>Task {idx + 1} of {activeIds.length}</div>
                  <div style={{ flex: 1, height: 6, background: "#e8eaed", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${((idx + 1) / activeIds.length) * 100}%`, background: "#1a73e8", borderRadius: 3, transition: "width 0.3s" }} />
                  </div>
                  <button onClick={() => setReviewMode(false)} style={{ background: "transparent", border: "1px solid #dadce0", color: "#5f6368", padding: "4px 14px", borderRadius: 16, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Exit Review</button>
                </div>

                {/* Title */}
                <div style={{ fontSize: 24, fontWeight: 700, color: "#202124", marginBottom: 4, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{task.title}</div>
                <div style={{ fontSize: 13, color: "#80868b", marginBottom: 20 }}>
                  {task.project && `${task.project}`}{task.activity && ` · ${task.activity}`}{task.customer && ` · ${task.customer}`}
                </div>

                {/* Priority score */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <div style={{
                    fontSize: 32, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif",
                    color: pri >= 15 ? "#d93025" : pri >= 8 ? "#e37400" : "#34a853"
                  }}>P: {pri}</div>
                  <span style={{
                    fontSize: 14, fontWeight: 700, padding: "5px 14px", borderRadius: 12,
                    background: urg.color + "18", color: urg.color
                  }}>⏰ {urg.label}</span>
                  {task.dueDate && <span style={{ fontSize: 13, color: "#5f6368" }}>Due: {task.dueDate}</span>}
                </div>

                {/* Urgency selector */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#202124", marginBottom: 8 }}>Urgency</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {URGENCY_LEVELS.map(u => (
                      <button key={u.key} onClick={() => setTaskUrgencyLevel(task.id, u.key)} style={{
                        fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 12, cursor: "pointer",
                        background: currentLevel === u.key ? u.color : "#ffffff",
                        color: currentLevel === u.key ? "#ffffff" : u.color,
                        border: `2px solid ${u.color}`, transition: "all 0.15s"
                      }}>{u.label}</button>
                    ))}
                  </div>
                </div>

                {/* Importance */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#202124", marginBottom: 8 }}>Importance</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1,2,3,4,5].map(v => (
                      <button key={v} onClick={() => updateTask(task.id, { importance: v })} style={{
                        fontSize: 28, cursor: "pointer", background: "transparent", border: "none", padding: "4px 6px",
                        color: v <= (task.importance || 1) ? "#fbbc04" : "#dadce0", transition: "transform 0.1s"
                      }}
                        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
                        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                      >★</button>
                    ))}
                  </div>
                </div>

                {/* Duration */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#202124", marginBottom: 8 }}>Duration</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {DURATION_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => updateTask(task.id, { duration: (task.duration || 0) === o.value ? 0 : o.value })} style={{
                        fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 12, cursor: "pointer",
                        background: (task.duration || 0) === o.value ? "#a142f4" : "#ffffff",
                        color: (task.duration || 0) === o.value ? "#fff" : "#5f6368",
                        border: `2px solid ${(task.duration || 0) === o.value ? "#a142f4" : "#dadce0"}`
                      }}>{o.label}</button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#202124", marginBottom: 8 }}>Status</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["not_started","Not Started","#f1f3f4","#5f6368"],["in_progress","In Progress","#e8f0fe","#1a73e8"],["on_hold","On Hold","#fef7e0","#e37400"],["waiting","Waiting For","#f3e8fd","#8b5cf6"]].map(([k,l,bg,c]) => (
                      <button key={k} onClick={() => updateTask(task.id, { status: k })} style={{
                        fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 12, cursor: "pointer",
                        background: task.status === k ? c : "#ffffff",
                        color: task.status === k ? "#ffffff" : c,
                        border: `2px solid ${c}`
                      }}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Delete confirmation */}
                {reviewConfirm === "delete" ? (
                  <div style={{ padding: "16px 20px", background: "#fce8e6", borderRadius: 12, marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#d93025", marginBottom: 10 }}>Remove this task?</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { cancelTask(task.id); setReviewConfirm(null); if (idx >= activeIds.length - 1) setReviewIndex(Math.max(0, idx - 1)); }} style={{
                        fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 12, cursor: "pointer",
                        background: "#e37400", color: "#fff", border: "none"
                      }}>Cancel Task</button>
                      <button onClick={() => { deleteTask(task.id); setReviewConfirm(null); if (idx >= activeIds.length - 1) setReviewIndex(Math.max(0, idx - 1)); }} style={{
                        fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 12, cursor: "pointer",
                        background: "#d93025", color: "#fff", border: "none"
                      }}>Delete Permanently</button>
                      <button onClick={() => setReviewConfirm(null)} style={{
                        fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 12, cursor: "pointer",
                        background: "#ffffff", color: "#5f6368", border: "1px solid #dadce0"
                      }}>Keep</button>
                    </div>
                    <div style={{ fontSize: 11, color: "#5f6368", marginTop: 8 }}>Cancel keeps a record · Delete removes permanently</div>
                  </div>
                ) : null}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { completeTask(task.id); if (idx >= activeIds.length - 1) setReviewIndex(Math.max(0, idx - 1)); }} style={{
                      fontSize: 14, fontWeight: 700, padding: "10px 24px", borderRadius: 16, cursor: "pointer",
                      background: "#34a853", color: "#fff", border: "none"
                    }}>✓ Done</button>
                    {reviewConfirm !== "delete" && (
                      <button onClick={() => setReviewConfirm("delete")} style={{
                        fontSize: 14, fontWeight: 600, padding: "10px 20px", borderRadius: 16, cursor: "pointer",
                        background: "#ffffff", color: "#d93025", border: "1px solid #d93025"
                      }}>🗑 Remove</button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {idx > 0 && (
                      <button onClick={() => { setReviewIndex(idx - 1); setReviewConfirm(null); }} style={{
                        fontSize: 14, fontWeight: 600, padding: "10px 20px", borderRadius: 16, cursor: "pointer",
                        background: "#f1f3f4", color: "#5f6368", border: "none"
                      }}>← Back</button>
                    )}
                    {idx < activeIds.length - 1 ? (
                      <button onClick={() => { setReviewIndex(idx + 1); setReviewConfirm(null); }} style={{
                        fontSize: 14, fontWeight: 700, padding: "10px 28px", borderRadius: 16, cursor: "pointer",
                        background: "#1a73e8", color: "#fff", border: "none"
                      }}>Next →</button>
                    ) : (
                      <button onClick={() => setReviewMode(false)} style={{
                        fontSize: 14, fontWeight: 700, padding: "10px 28px", borderRadius: 16, cursor: "pointer",
                        background: "#1a73e8", color: "#fff", border: "none"
                      }}>Finish ✓</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ═══ KANBAN VIEW ═══ */}
          {taskView === "kanban" && !reviewMode && (() => {
            const allActive = tasks.filter(t => t.status !== "cancelled");
            const todayS = dateStr(new Date());
            const thisWeekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + (5 - ((d.getDay() + 6) % 7))); return dateStr(d); })();
            const nextWeekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + (12 - ((d.getDay() + 6) % 7))); return dateStr(d); })();

            function buildColumns() {
              if (kanbanSort === "status" || !kanbanSort) return {
                cols: [
                  { key: "not_started", label: "Not Started", color: "#5f6368", bg: "#f1f3f4" },
                  { key: "in_progress", label: "In Progress", color: "#1a73e8", bg: "#e8f0fe" },
                  { key: "waiting", label: "Waiting For", color: "#8b5cf6", bg: "#f3e8fd" },
                  { key: "on_hold", label: "On Hold", color: "#e37400", bg: "#fef7e0" },
                  { key: "completed", label: "Done", color: "#34a853", bg: "#e6f4ea" }
                ],
                getCol: t => t.status,
                onDrop: (tid, colKey) => updateTask(tid, colKey === "completed" ? { status: "completed", completedDate: dateStr(new Date()) } : { status: colKey })
              };
              if (kanbanSort === "priority") return {
                cols: [
                  { key: "critical", label: "🔥 Critical (≥20)", color: "#d93025", bg: "#fce8e6" },
                  { key: "high", label: "⚠️ High (≥10)", color: "#e37400", bg: "#fef7e0" },
                  { key: "medium", label: "Medium (≥5)", color: "#1a73e8", bg: "#e8f0fe" },
                  { key: "low", label: "Low (<5)", color: "#5f6368", bg: "#f1f3f4" }
                ],
                getCol: t => { const p = getUrgency(t).score * (t.importance || 1); return p >= 20 ? "critical" : p >= 10 ? "high" : p >= 5 ? "medium" : "low"; },
                onDrop: null
              };
              if (kanbanSort === "due") return {
                cols: [
                  { key: "overdue", label: "🔴 Overdue", color: "#d93025", bg: "#fce8e6" },
                  { key: "today", label: "Today", color: "#e37400", bg: "#fef7e0" },
                  { key: "thisweek", label: "This Week", color: "#1a73e8", bg: "#e8f0fe" },
                  { key: "nextweek", label: "Next Week", color: "#8b5cf6", bg: "#f3e8fd" },
                  { key: "later", label: "Later", color: "#34a853", bg: "#e6f4ea" },
                  { key: "nodate", label: "No Date", color: "#5f6368", bg: "#f1f3f4" }
                ],
                getCol: t => !t.dueDate ? "nodate" : t.dueDate < todayS ? "overdue" : t.dueDate === todayS ? "today" : t.dueDate <= thisWeekEnd ? "thisweek" : t.dueDate <= nextWeekEnd ? "nextweek" : "later",
                onDrop: null
              };
              if (kanbanSort === "importance") return {
                cols: [5,4,3,2,1].map(v => ({ key: String(v), label: "★".repeat(v) + "☆".repeat(5-v), color: v >= 4 ? "#e37400" : v >= 3 ? "#1a73e8" : "#5f6368", bg: v >= 4 ? "#fef7e0" : v >= 3 ? "#e8f0fe" : "#f1f3f4" })),
                getCol: t => String(t.importance || 1),
                onDrop: (tid, colKey) => updateTask(tid, { importance: parseInt(colKey) })
              };
              if (kanbanSort === "project") {
                const projects = [...new Set(allActive.map(t => t.project || ""))].sort((a, b) => (a || "zzz").localeCompare(b || "zzz"));
                return {
                  cols: projects.map(p => ({ key: p, label: p || "(No project)", color: "#1a73e8", bg: "#e8f0fe" })),
                  getCol: t => t.project || "",
                  onDrop: (tid, colKey) => updateTask(tid, { project: colKey })
                };
              }
              if (kanbanSort === "customer") {
                const custs = [...new Set(allActive.map(t => t.customer || ""))].sort((a, b) => (a || "zzz").localeCompare(b || "zzz"));
                return {
                  cols: custs.map(c => ({ key: c, label: c || "(No customer)", color: "#8b5cf6", bg: "#f3e8fd" })),
                  getCol: t => t.customer || "",
                  onDrop: (tid, colKey) => updateTask(tid, { customer: colKey })
                };
              }
              if (kanbanSort === "workOrder") {
                const wos = [...new Set(allActive.map(t => t.workOrder || ""))].sort((a, b) => (a || "zzz").localeCompare(b || "zzz"));
                return {
                  cols: wos.map(w => ({ key: w, label: w || "(No work order)", color: "#0d904f", bg: "#e6f4ea" })),
                  getCol: t => t.workOrder || "",
                  onDrop: (tid, colKey) => updateTask(tid, { workOrder: colKey })
                };
              }
              return buildColumns(); // fallback
            }

            const { cols, getCol, onDrop } = buildColumns();
            const prioSort = (a, b) => (getUrgency(b).score * (b.importance || 1)) - (getUrgency(a).score * (a.importance || 1));

            return (
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "#5f6368", fontWeight: 600 }}>Columns:</span>
                  {[["status","Status"],["priority","Priority"],["due","Due Date"],["importance","Importance"],["project","Project"],["customer","Customer"],["workOrder","Work Order"]].map(([k,l]) => (
                    <button key={k} onClick={() => setKanbanSort(k)} style={{
                      fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 14, cursor: "pointer",
                      background: kanbanSort === k ? "#1a73e8" : "#fff",
                      color: kanbanSort === k ? "#fff" : "#5f6368",
                      border: `1px solid ${kanbanSort === k ? "#1a73e8" : "#dadce0"}`
                    }}>{l}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cols.length, 6)}, 1fr)`, gap: 10, alignItems: "start", overflowX: cols.length > 6 ? "auto" : "visible" }}>
                  {cols.map(col => {
                    const colTasks = allActive.filter(t => getCol(t) === col.key).sort(prioSort);
                    return (
                      <div key={col.key}
                        onDragOver={onDrop ? e => { e.preventDefault(); e.currentTarget.style.outline = `2px dashed ${col.color}`; } : undefined}
                        onDragLeave={onDrop ? e => { e.currentTarget.style.outline = "none"; } : undefined}
                        onDrop={onDrop ? e => { e.preventDefault(); e.currentTarget.style.outline = "none";
                          const tid = e.dataTransfer.getData("text/kanbanTask");
                          if (tid) onDrop(tid, col.key);
                        } : undefined}
                        style={{ background: col.bg, borderRadius: 12, padding: "12px", minHeight: 200 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: col.color, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                          <span>{col.label}</span><span style={{ fontSize: 12, fontWeight: 500 }}>{colTasks.length}</span>
                        </div>
                        {colTasks.map(task => {
                          const urg = getUrgency(task);
                          const sub = task.subtasks || [];
                          const subDone = sub.filter(s => s.done).length;
                          return (
                            <div key={task.id} draggable
                              onDragStart={e => { e.dataTransfer.setData("text/kanbanTask", task.id); e.dataTransfer.effectAllowed = "move"; }}
                              onClick={() => { setTaskView("list"); setEditingTaskId(task.id); }}
                              style={{
                                background: "#fff", border: "1px solid #e8eaed", borderRadius: 8, padding: "10px 12px",
                                marginBottom: 6, cursor: "grab", boxShadow: "0 1px 2px rgba(0,0,0,0.06)"
                              }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#202124", marginBottom: 4 }}>{task.title}</div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 6, background: urg.color + "18", color: urg.color }}>{urg.label}</span>
                                {task.duration > 0 && <span style={{ fontSize: 10, color: "#a142f4" }}>{fmtDuration(task.duration)}</span>}
                                {task.project && <span style={{ fontSize: 10, color: "#80868b" }}>{task.project}</span>}
                                {task.delegatedTo && <span style={{ fontSize: 10, color: "#8b5cf6" }}>👤</span>}
                                {task.blockedBy && <span style={{ fontSize: 10, color: "#d93025" }}>🚫</span>}
                                {sub.length > 0 && <span style={{ fontSize: 10, color: subDone === sub.length ? "#34a853" : "#5f6368" }}>☑ {subDone}/{sub.length}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ═══ WEEKLY PLANNING VIEW ═══ */}
          {taskView === "planning" && !reviewMode && (() => {
            const n = new Date();
            const weekStart = getMondayOfWeek(currentWeek, currentYear);
            const days = Array.from({ length: 5 }, (_, i) => {
              const d = new Date(weekStart); d.setDate(d.getDate() + i);
              const ds = dateStr(d);
              const entries = weekData[i] || [];
              const tracked = entries.reduce((s, e) => { const es = parseTime(e.start), ee = parseTime(e.end); return (es !== null && ee !== null) ? s + (ee - es) : s; }, 0);
              const scheduledTasks = tasks.filter(t => t.scheduledDate === ds && t.status !== "completed" && t.status !== "cancelled");
              const dueTasks = tasks.filter(t => t.dueDate === ds && t.status !== "completed" && t.status !== "cancelled");
              return { d, ds, entries, tracked, scheduledTasks, dueTasks, label: ["Mon","Tue","Wed","Thu","Fri"][i] };
            });
            const unplanned = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled" && !t.scheduledDate && (t.duration || 0) > 0)
              .sort((a, b) => (getUrgency(b).score * (b.importance || 1)) - (getUrgency(a).score * (a.importance || 1)));
            return (
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#202124", marginBottom: 12 }}>📆 Week Plan — W{currentWeek} {currentYear}</div>
                <div className="wht-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr) 200px", gap: 10, alignItems: "start" }}>
                  {days.map((day, i) => (
                    <div key={i}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "#e8f0fe"; }}
                      onDragLeave={e => { e.currentTarget.style.background = "#fff"; }}
                      onDrop={e => {
                        e.preventDefault(); e.currentTarget.style.background = "#fff";
                        const tid = e.dataTransfer.getData("text/planTask");
                        if (tid) updateTask(tid, { scheduledDate: day.ds });
                      }}
                      style={{ background: "#fff", border: dateStr(n) === day.ds ? "2px solid #1a73e8" : "1px solid #e8eaed", borderRadius: 10, padding: "10px", minHeight: 150 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: dateStr(n) === day.ds ? "#1a73e8" : "#5f6368", marginBottom: 6 }}>
                        {day.label} {day.d.getDate()}<span style={{ fontWeight: 400, marginLeft: 6 }}>{fmtH(day.tracked)}h</span>
                      </div>
                      {day.entries.sort((a, b) => (a.start || "").localeCompare(b.start || "")).slice(0, 4).map(e => (
                        <div key={e.id} style={{ fontSize: 10, padding: "2px 6px", background: "#f1f3f4", borderRadius: 4, marginBottom: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                          {e.start} {e.note || ""}
                        </div>
                      ))}
                      {day.scheduledTasks.map(t => (
                        <div key={t.id} style={{ fontSize: 11, padding: "4px 8px", background: "#e6f4ea", borderRadius: 6, marginTop: 4, fontWeight: 500 }}>📅 {t.title}</div>
                      ))}
                      {day.dueTasks.filter(t => !day.scheduledTasks.some(s => s.id === t.id)).map(t => (
                        <div key={t.id} style={{ fontSize: 11, padding: "4px 8px", background: "#fce8e6", borderRadius: 6, marginTop: 4, fontWeight: 500 }}>⚠ Due: {t.title}</div>
                      ))}
                    </div>
                  ))}
                  {/* Unplanned sidebar */}
                  <div style={{ background: "#f8f9fa", borderRadius: 10, padding: "10px", maxHeight: 400, overflowY: "auto" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#5f6368", marginBottom: 6 }}>Unplanned</div>
                    {unplanned.slice(0, 15).map(t => (
                      <div key={t.id} draggable onDragStart={e => { e.dataTransfer.setData("text/planTask", t.id); }}
                        style={{ fontSize: 11, padding: "6px 8px", background: "#fff", border: "1px solid #e8eaed", borderRadius: 6, marginBottom: 4, cursor: "grab" }}>
                        <div style={{ fontWeight: 600, color: "#202124" }}>{t.title}</div>
                        <div style={{ fontSize: 10, color: "#80868b" }}>{fmtDuration(t.duration)} · {t.project || "No project"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ═══ SCHEDULE VIEW ═══ */}
          {taskView === "schedule" && !reviewMode && (() => {
            const n = new Date();
            const todayWn = getWeekNumber(n), todayYr = n.getFullYear();
            const todayKey = `${todayYr}-W${todayWn}`;
            const todayDi = (n.getDay() + 6) % 7;
            const todayEntries = (allData[todayKey] || [])[todayDi] || [];

            const unscheduledTasks = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled" && (t.duration || 0) > 0)
              .sort((a, b) => (getUrgency(b).score * (b.importance || 1)) - (getUrgency(a).score * (a.importance || 1)));

            return (
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#202124", marginBottom: 12 }}>
                  🗓 Schedule Tasks — {n.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </div>
                <div className="wht-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
                  {/* Left: Full scrollable calendar */}
                  <div style={{ position: "relative" }}>
                    <div style={{ height: CAL_VIEW_H, overflow: "hidden", borderRadius: 12, border: "1px solid #e8eaed", background: "#fff",
                        cursor: schedDrag ? (schedDrag.type === "move" ? "grabbing" : "ns-resize") : "default" }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                      onMouseMove={e => {
                        if (!schedDrag) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top + calScroll * HOUR_H;
                        const rawTime = CAL_START + (y / HOUR_H);
                        const snapped = Math.round(rawTime * 4) / 4;
                        const entry = todayEntries.find(en => en.id === schedDrag.id);
                        if (!entry) return;
                        const curStart = parseTime(entry.start), curEnd = parseTime(entry.end);
                        if (curStart === null || curEnd === null) return;
                        const others = todayEntries.filter(en => en.id !== schedDrag.id).map(o => ({ s: parseTime(o.start), e: parseTime(o.end) })).filter(o => o.s !== null && o.e !== null);
                        if (schedDrag.type === "start") {
                          const ns = Math.max(CAL_START, Math.min(snapped, curEnd - 0.25));
                          if (!others.some(o => ns < o.e && curEnd > o.s)) updateEntryFields(schedDrag.id, { start: timeToStr(ns) });
                        } else if (schedDrag.type === "end") {
                          const ne = Math.min(CAL_END, Math.max(snapped, curStart + 0.25));
                          if (!others.some(o => curStart < o.e && ne > o.s)) updateEntryFields(schedDrag.id, { end: timeToStr(ne) });
                        } else if (schedDrag.type === "move") {
                          const dur = curEnd - curStart;
                          let ns = Math.round((rawTime - schedDrag.offset) * 4) / 4;
                          ns = Math.max(CAL_START, Math.min(ns, CAL_END - dur));
                          const ne = ns + dur;
                          if (!others.some(o => ns < o.e && ne > o.s)) updateEntryFields(schedDrag.id, { start: timeToStr(ns), end: timeToStr(ne) });
                        }
                      }}
                      onMouseUp={() => {
                        if (schedDrag) {
                          const entry = todayEntries.find(en => en.id === schedDrag.id);
                          if (entry && entry.taskId) updateTask(entry.taskId, { scheduledStart: entry.start, scheduledEnd: entry.end });
                          setSchedDrag(null);
                        }
                      }}
                      onMouseLeave={() => { if (schedDrag) setSchedDrag(null); }}
                      onDrop={e => {
                        e.preventDefault();
                        const taskId = e.dataTransfer.getData("text/taskId");
                        const task = tasks.find(t => t.id === taskId);
                        if (!task) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top + calScroll * HOUR_H;
                        const rawTime = CAL_START + (y / HOUR_H);
                        const snapped = Math.round(rawTime * 4) / 4;
                        const start = Math.max(CAL_START, Math.min(snapped, CAL_END));
                        const dur = (task.duration || 60) / 60;
                        const end = Math.min(start + dur, CAL_END);
                        const startStr = timeToStr(start), endStr = timeToStr(end);
                        const overlaps = todayEntries.some(ent => {
                          const es = parseTime(ent.start), ee = parseTime(ent.end);
                          return es !== null && ee !== null && start < ee && end > es;
                        });
                        if (overlaps) return;
                        addEntry(todayDi, startStr, endStr);
                        setAllData(prev => {
                          const wd = prev[todayKey] || [[], [], [], [], [], [], []];
                          const dayArr = wd[todayDi] || [];
                          const last = dayArr[dayArr.length - 1];
                          if (last) {
                            const updated = [...wd];
                            updated[todayDi] = dayArr.map(ent => ent.id === last.id ? {
                              ...ent, note: task.title, activity: task.activity || ent.activity,
                              project: task.project || ent.project, customer: task.customer || ent.customer,
                              workOrder: task.workOrder || ent.workOrder, tags: task.tags || ent.tags, taskId: task.id
                            } : ent);
                            return { ...prev, [todayKey]: updated };
                          }
                          return prev;
                        });
                        updateTask(taskId, { scheduledStart: startStr, scheduledEnd: endStr, scheduledDate: dateStr(n) });
                      }}>
                      <div style={{ position: "relative", height: CAL_H, transform: `translateY(${-calScroll * HOUR_H}px)`, userSelect: "none" }}
                        onClick={e => { if (!schedDrag) setSchedSelId(null); }}>
                        {/* Hour lines */}
                        {Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i).map(h => (
                          <div key={h} style={{ position: "absolute", top: (h - CAL_START) * HOUR_H, left: 0, right: 0, display: "flex", alignItems: "center", zIndex: 1 }}>
                            <div style={{ width: 50, textAlign: "right", paddingRight: 8, fontSize: 11, color: "#80868b" }}>{h.toString().padStart(2, "0")}:00</div>
                            <div style={{ flex: 1, height: 1, background: "#e8eaed" }} />
                          </div>
                        ))}
                        {/* Half-hour lines */}
                        {Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i).filter(h => h < CAL_END).map(h => (
                          <div key={`hh${h}`} style={{ position: "absolute", top: (h - CAL_START + 0.5) * HOUR_H, left: 54, right: 0, height: 1, background: "#f4f4f4", zIndex: 1 }} />
                        ))}
                        {/* Work boundary lines */}
                        {(() => {
                          const ws = parseTime(defaults.startTime || "08:00"), we = parseTime(defaults.endTime || "17:00");
                          if (ws === null || we === null) return null;
                          return (
                            <>
                              <div style={{ position: "absolute", left: 54, right: 0, top: (ws - CAL_START) * HOUR_H, height: (we - ws) * HOUR_H, background: "#e8f0fe15", zIndex: 0 }} />
                              <div style={{ position: "absolute", top: (ws - CAL_START) * HOUR_H, left: 54, right: 0, height: 2, background: "#1a73e8", opacity: 0.3, zIndex: 5 }} />
                              <div style={{ position: "absolute", top: (we - CAL_START) * HOUR_H, left: 54, right: 0, height: 2, background: "#1a73e8", opacity: 0.3, zIndex: 5 }} />
                            </>
                          );
                        })()}
                        {/* Existing entries — mouse-based move, resize, delete */}
                        {todayEntries.map((ent, i) => {
                          const s = parseTime(ent.start), en = parseTime(ent.end);
                          if (s === null || en === null) return null;
                          const top = (s - CAL_START) * HOUR_H;
                          const height = Math.max((en - s) * HOUR_H, 8);
                          const col = BLOCK_COLORS[i % BLOCK_COLORS.length];
                          const isSel = schedSelId === ent.id;
                          const handleZone = Math.max(14, Math.min(height / 3, 20));
                          return (
                            <div key={ent.id}
                              onClick={e => e.stopPropagation()}
                              onMouseDown={e => {
                                e.stopPropagation();
                                if (e.button !== 0) return;
                                if (!isSel) {
                                  // First click: just select, don't drag
                                  setSchedSelId(ent.id);
                                  return;
                                }
                                // Already selected — check resize zones or move
                                const rect = e.currentTarget.getBoundingClientRect();
                                const yInBlock = e.clientY - rect.top;
                                if (yInBlock < handleZone) {
                                  e.preventDefault(); setSchedDrag({ id: ent.id, type: "start" });
                                } else if (yInBlock > height - handleZone) {
                                  e.preventDefault(); setSchedDrag({ id: ent.id, type: "end" });
                                } else {
                                  const offsetHrs = yInBlock / HOUR_H;
                                  e.preventDefault(); setSchedDrag({ id: ent.id, type: "move", offset: offsetHrs });
                                }
                              }}
                              style={{
                                position: "absolute", left: 56, right: 8, top, height,
                                background: isSel ? `${col}30` : `${col}20`, borderLeft: `3px solid ${col}`, borderRadius: "0 6px 6px 0",
                                zIndex: isSel ? 4 : 2, cursor: schedDrag && schedDrag.id === ent.id ? (schedDrag.type === "move" ? "grabbing" : "ns-resize") : "grab",
                                outline: isSel ? `2px solid ${col}` : "none", outlineOffset: 1
                              }}>
                              {/* Resize hint zones */}
                              {isSel && (
                                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: handleZone, cursor: "ns-resize", zIndex: 10 }}>
                                  <div style={{ background: col, color: "#fff", fontSize: 10, fontWeight: 700, padding: "0px 6px", borderRadius: "0 3px 3px 0", display: "inline-block", lineHeight: "16px" }}>{ent.start}</div>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: handleZone, cursor: "ns-resize", zIndex: 10 }}>
                                  <div style={{ background: col, color: "#fff", fontSize: 10, fontWeight: 700, padding: "0px 6px", borderRadius: "3px 0 0 3px", display: "inline-block", position: "absolute", bottom: 0, lineHeight: "16px" }}>{ent.end}</div>
                                </div>
                              )}
                              {/* Delete button */}
                              {isSel && (
                                <div onMouseDown={e => { e.stopPropagation(); }} onClick={e => { e.stopPropagation(); deleteEntry(ent.id); setSchedSelId(null); }}
                                  title="Remove from calendar"
                                  style={{
                                    position: "absolute", top: "50%", right: 4, transform: "translateY(-50%)",
                                    width: 20, height: 20, borderRadius: 10, background: "#d93025", color: "#fff",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    cursor: "pointer", zIndex: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                                  }}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                                </div>
                              )}
                              {/* Label */}
                              <div style={{ position: "absolute", top: isSel && height >= 28 ? handleZone : 0, bottom: isSel && height >= 28 ? handleZone : 0, left: 4, right: isSel ? 28 : 4, display: "flex", alignItems: "center", pointerEvents: "none" }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#202124", background: "rgba(255,255,255,0.85)", padding: "1px 6px", borderRadius: 4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                                  {ent.note || `${ent.start}–${ent.end}`}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Now line */}
                        {(() => {
                          const nowH = n.getHours() + n.getMinutes() / 60;
                          if (nowH < CAL_START || nowH > CAL_END) return null;
                          return (
                            <div style={{ position: "absolute", top: (nowH - CAL_START) * HOUR_H, left: 0, right: 0, zIndex: 8, pointerEvents: "none" }}>
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#d93025", flexShrink: 0, marginLeft: 44 }} />
                                <div style={{ flex: 1, height: 2, background: "#d93025" }} />
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    {/* Scroll buttons */}
                    {calScroll > 0 && (
                      <button onClick={() => setCalScroll(s => Math.max(0, s - 2))}
                        style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", zIndex: 10,
                          width: 36, height: 22, borderRadius: 12, border: "1px solid #dadce0", background: "rgba(255,255,255,0.9)",
                          color: "#5f6368", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>▲</button>
                    )}
                    {calScroll < CAL_END - CAL_VIEW_HOURS && (
                      <button onClick={() => setCalScroll(s => Math.min(CAL_END - CAL_VIEW_HOURS, s + 2))}
                        style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", zIndex: 10,
                          width: 36, height: 22, borderRadius: 12, border: "1px solid #dadce0", background: "rgba(255,255,255,0.9)",
                          color: "#5f6368", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}>▼</button>
                    )}
                  </div>

                  {/* Right: Filterable task sidebar */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: CAL_VIEW_H, overflowY: "auto" }}>
                    <div style={{ position: "sticky", top: 0, background: "#f1f3f4", padding: "6px 0 8px", zIndex: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                        Drag tasks to calendar
                      </div>
                      <input value={schedFilter.search} onChange={e => setSchedFilter(p => ({ ...p, search: e.target.value }))}
                        placeholder="🔍 Search tasks..." style={{ width: "100%", fontSize: 12, padding: "6px 10px", border: "1px solid #dadce0", borderRadius: 8, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <select value={schedFilter.project} onChange={e => setSchedFilter(p => ({ ...p, project: e.target.value }))}
                          style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #dadce0", borderRadius: 6, outline: "none", color: schedFilter.project ? "#202124" : "#80868b", cursor: "pointer", flex: 1, minWidth: 0 }}>
                          <option value="">All projects</option>
                          {[...new Set(unscheduledTasks.map(t => t.project).filter(Boolean))].sort().map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={schedFilter.customer} onChange={e => setSchedFilter(p => ({ ...p, customer: e.target.value }))}
                          style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #dadce0", borderRadius: 6, outline: "none", color: schedFilter.customer ? "#202124" : "#80868b", cursor: "pointer", flex: 1, minWidth: 0 }}>
                          <option value="">All customers</option>
                          {[...new Set(unscheduledTasks.map(t => t.customer).filter(Boolean))].sort().map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={schedFilter.workOrder} onChange={e => setSchedFilter(p => ({ ...p, workOrder: e.target.value }))}
                          style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #dadce0", borderRadius: 6, outline: "none", color: schedFilter.workOrder ? "#202124" : "#80868b", cursor: "pointer", flex: 1, minWidth: 0 }}>
                          <option value="">All work orders</option>
                          {[...new Set(unscheduledTasks.map(t => t.workOrder).filter(Boolean))].sort().map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                        <select value={schedFilter.duration} onChange={e => setSchedFilter(p => ({ ...p, duration: Number(e.target.value) }))}
                          style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #dadce0", borderRadius: 6, outline: "none", color: schedFilter.duration ? "#a142f4" : "#80868b", cursor: "pointer" }}>
                          <option value={0}>Any duration</option>
                          {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select value={schedFilter.status} onChange={e => setSchedFilter(p => ({ ...p, status: e.target.value }))}
                          style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #dadce0", borderRadius: 6, outline: "none", color: schedFilter.status !== "all" ? "#1a73e8" : "#80868b", cursor: "pointer" }}>
                          <option value="all">Any status</option>
                          <option value="not_started">Not Started</option>
                          <option value="in_progress">In Progress</option>
                          <option value="on_hold">On Hold</option>
                        </select>
                        {(schedFilter.search || schedFilter.project || schedFilter.customer || schedFilter.workOrder || schedFilter.duration || schedFilter.status !== "all") && (
                          <button onClick={() => setSchedFilter({ search: "", project: "", customer: "", workOrder: "", duration: 0, status: "all" })}
                            style={{ fontSize: 11, color: "#d93025", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, padding: "3px 6px" }}>✕ Clear</button>
                        )}
                      </div>
                    </div>
                    {(() => {
                      let filtered = unscheduledTasks;
                      if (schedFilter.search) { const q = schedFilter.search.toLowerCase(); filtered = filtered.filter(t => (t.title || "").toLowerCase().includes(q) || (t.project || "").toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q)); }
                      if (schedFilter.project) filtered = filtered.filter(t => t.project === schedFilter.project);
                      if (schedFilter.customer) filtered = filtered.filter(t => t.customer === schedFilter.customer);
                      if (schedFilter.workOrder) filtered = filtered.filter(t => t.workOrder === schedFilter.workOrder);
                      if (schedFilter.duration) filtered = filtered.filter(t => (t.duration || 0) === schedFilter.duration);
                      if (schedFilter.status !== "all") filtered = filtered.filter(t => t.status === schedFilter.status);
                      if (filtered.length === 0) return (
                        <div style={{ padding: 20, textAlign: "center", color: "#80868b", fontSize: 13, fontStyle: "italic", background: "#f8f9fa", borderRadius: 10 }}>
                          {unscheduledTasks.length === 0 ? "No tasks with durations set" : "No tasks match filters"}
                        </div>
                      );
                      return (<>
                        <div style={{ fontSize: 11, color: "#80868b", marginBottom: 2 }}>{filtered.length} task{filtered.length !== 1 ? "s" : ""}</div>
                        {filtered.map(task => {
                      const urg = getUrgency(task);
                      const pri = (urg.score * (task.importance || 1)).toFixed(1);
                      return (
                        <div key={task.id} draggable
                          onDragStart={e => { e.dataTransfer.setData("text/taskId", task.id); e.dataTransfer.effectAllowed = "copy"; }}
                          style={{
                            background: task.scheduledStart ? "#e6f4ea" : "#ffffff",
                            border: `1px solid ${task.scheduledStart ? "#34a853" : "#e8eaed"}`,
                            borderLeft: `4px solid ${urg.color}`,
                            borderRadius: "0 10px 10px 0", padding: "8px 12px",
                            cursor: "grab", boxSizing: "border-box"
                          }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#202124", marginBottom: 4, lineHeight: 1.3 }}>{task.title}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5f6368", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, color: pri >= 15 ? "#d93025" : pri >= 8 ? "#e37400" : "#34a853" }}>P:{pri}</span>
                            <span style={{ fontWeight: 600, color: "#a142f4" }}>⏱ {fmtDuration(task.duration)}</span>
                            <span style={{ fontWeight: 600, color: urg.color }}>{urg.label}</span>
                            {task.scheduledStart && <span style={{ color: "#137333" }}>📅 {task.scheduledStart}–{task.scheduledEnd}</span>}
                            {task.project && <span style={{ color: "#80868b" }}>{task.project}</span>}
                          </div>
                        </div>
                      );
                    })}
                      </>);
                    })()}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ═══ TASK REPORTS VIEW ═══ */}
          {taskView === "taskreports" && !reviewMode && taskMetrics && (() => {
            const m = taskMetrics;
            function CapacityCard({ label, period }) {
              const pct = period.free > 0 ? Math.min((period.mins / period.free) * 100, 100) : (period.mins > 0 ? 100 : 0);
              const over = period.mins > period.free;
              return (
                <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>{label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: over ? "#d93025" : "#1a73e8", fontFamily: "'Inter', 'Roboto', sans-serif" }}>{fmtGapTime(period.mins)}</span>
                    <span style={{ fontSize: 14, color: "#5f6368" }}>needed</span>
                  </div>
                  <div style={{ height: 10, background: "#e8eaed", borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: over ? "#d93025" : pct > 75 ? "#e37400" : "#34a853", borderRadius: 5, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5f6368" }}>
                    <span>{period.tasks} task{period.tasks !== 1 ? "s" : ""}</span>
                    <span>{fmtGapTime(period.free)} available</span>
                  </div>
                  {over && <div style={{ fontSize: 12, fontWeight: 600, color: "#d93025", marginTop: 4 }}>⚠ Over capacity by {fmtGapTime(period.mins - period.free)}</div>}
                  {!over && period.free > period.mins && <div style={{ fontSize: 12, color: "#34a853", marginTop: 4 }}>{fmtGapTime(period.free - period.mins)} spare</div>}
                </div>
              );
            }
            const statusColors = { not_started: "#5f6368", in_progress: "#1a73e8", on_hold: "#e37400" };
            const statusLabels = { not_started: "Not Started", in_progress: "In Progress", on_hold: "On Hold" };
            const urgColors = { "Now": "#d93025", "Urgent": "#c5221f", "Today": "#ea4335", "Tomorrow": "#e37400", "This week": "#1a73e8", "This month": "#34a853", "Anytime": "#80868b" };

            return (
              <div>
                {/* Capacity cards */}
                <div style={{ fontSize: 16, fontWeight: 700, color: "#202124", marginBottom: 12 }}>📊 Task Capacity</div>
                <div className="wht-grid-4col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
                  <CapacityCard label="Today" period={m.today} />
                  <CapacityCard label="This Week" period={m.week} />
                  <CapacityCard label="This Month" period={m.month} />
                  <CapacityCard label="Next Month" period={m.nextMonth} />
                </div>

                {/* Overview stats */}
                <div style={{ fontSize: 16, fontWeight: 700, color: "#202124", marginBottom: 12 }}>📋 Overview</div>
                <div className="wht-grid-4col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                  {[
                    { label: "Active Tasks", value: m.total, color: "#1a73e8" },
                    { label: "Overdue", value: m.overdue, color: m.overdue > 0 ? "#d93025" : "#34a853" },
                    { label: "Completed", value: m.completed, color: "#34a853" },
                    { label: "Cancelled", value: m.cancelled, color: "#e37400" }
                  ].map(s => (
                    <div key={s.label} style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize: 32, fontWeight: 700, color: s.color, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "#5f6368", marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Velocity */}
                <div className="wht-grid-4col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
                  {[
                    { label: "Completed This Week", value: m.completedThisWeek, color: "#34a853" },
                    { label: "Completed This Month", value: m.completedThisMonth, color: "#34a853" },
                    { label: "Avg Importance", value: m.avgImportance + " ★", color: "#fbbc04" },
                    { label: "Recurring Tasks", value: m.recurringCount, color: "#1a73e8" }
                  ].map(s => (
                    <div key={s.label} style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "#5f6368", marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Status breakdown */}
                <div className="wht-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                  <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#202124", marginBottom: 12 }}>By Status</div>
                    {Object.entries(m.byStatus).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColors[k], flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: "#3c4043" }}>{statusLabels[k]}</span>
                        <div style={{ width: 80, height: 6, background: "#e8eaed", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: m.total > 0 ? `${(v / m.total) * 100}%` : "0%", background: statusColors[k], borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#202124", width: 24, textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#202124", marginBottom: 12 }}>By Urgency</div>
                    {Object.entries(m.byUrgency).sort((a, b) => {
                      const order = ["Now","Urgent","Today","Tomorrow","This week","This month","Anytime"];
                      return order.indexOf(a[0]) - order.indexOf(b[0]);
                    }).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: urgColors[k] || "#80868b", flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: "#3c4043" }}>{k}</span>
                        <div style={{ width: 80, height: 6, background: "#e8eaed", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: m.total > 0 ? `${(v / m.total) * 100}%` : "0%", background: urgColors[k] || "#80868b", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#202124", width: 24, textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Warnings */}
                {(m.noDuration > 0 || m.noDueDate > 0 || m.overdue > 0) && (
                  <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#202124", marginBottom: 10 }}>⚠ Attention Needed</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {m.overdue > 0 && (
                        <div style={{ padding: "8px 16px", background: "#fce8e6", borderRadius: 10, fontSize: 13, color: "#d93025", fontWeight: 600 }}>
                          🔴 {m.overdue} overdue task{m.overdue !== 1 ? "s" : ""}
                        </div>
                      )}
                      {m.noDuration > 0 && (
                        <div style={{ padding: "8px 16px", background: "#fef7e0", borderRadius: 10, fontSize: 13, color: "#e37400", fontWeight: 600 }}>
                          ⏱ {m.noDuration} task{m.noDuration !== 1 ? "s" : ""} without duration
                        </div>
                      )}
                      {m.noDueDate > 0 && (
                        <div style={{ padding: "8px 16px", background: "#f1f3f4", borderRadius: 10, fontSize: 13, color: "#5f6368", fontWeight: 600 }}>
                          📅 {m.noDueDate} task{m.noDueDate !== 1 ? "s" : ""} without due date
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ PERIOD REPORTS ═══ */}
                <div style={{ marginTop: 28, borderTop: "2px solid #e8eaed", paddingTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#202124" }}>📅 Period Report</div>
                    <div style={{ display: "flex", gap: 3, background: "#f1f3f4", borderRadius: 8, padding: 2 }}>
                      {[["weekly","Weekly"],["monthly","Monthly"],["annual","Annual"]].map(([k,l]) => (
                        <button key={k} onClick={() => setTaskReportView(k)} style={{
                          fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600, padding: "5px 14px",
                          background: taskReportView === k ? "#fff" : "transparent", color: taskReportView === k ? "#1a73e8" : "#5f6368",
                          border: "none", borderRadius: 6, cursor: "pointer", boxShadow: taskReportView === k ? "0 1px 3px rgba(0,0,0,0.12)" : "none"
                        }}>{l}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => {
                        if (taskReportView === "weekly") { let w = taskReportWeek - 1, y = taskReportWeekYear; if (w < 1) { y--; w = 52; } setTaskReportWeek(w); setTaskReportWeekYear(y); }
                        else if (taskReportView === "monthly") { let mo = taskReportMonth - 1, y = taskReportMonthYear; if (mo < 0) { y--; mo = 11; } setTaskReportMonth(mo); setTaskReportMonthYear(y); }
                        else setTaskReportYear(taskReportYear - 1);
                        setTaskReportExpanded(null);
                      }} style={{ background: "#fff", border: "1px solid #dadce0", borderRadius: 16, padding: "4px 12px", cursor: "pointer", fontSize: 14, color: "#5f6368" }}>←</button>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#202124", minWidth: 160, textAlign: "center" }}>
                        {taskReportView === "weekly" ? `Week ${taskReportWeek}, ${taskReportWeekYear}` :
                         taskReportView === "monthly" ? `${MONTHS[taskReportMonth]} ${taskReportMonthYear}` :
                         `${taskReportYear}`}
                      </span>
                      <button onClick={() => {
                        if (taskReportView === "weekly") { let w = taskReportWeek + 1, y = taskReportWeekYear; if (w > 52) { y++; w = 1; } setTaskReportWeek(w); setTaskReportWeekYear(y); }
                        else if (taskReportView === "monthly") { let mo = taskReportMonth + 1, y = taskReportMonthYear; if (mo > 11) { y++; mo = 0; } setTaskReportMonth(mo); setTaskReportMonthYear(y); }
                        else setTaskReportYear(taskReportYear + 1);
                        setTaskReportExpanded(null);
                      }} style={{ background: "#fff", border: "1px solid #dadce0", borderRadius: 16, padding: "4px 12px", cursor: "pointer", fontSize: 14, color: "#5f6368" }}>→</button>
                    </div>
                  </div>

                  {(() => {
                    let periodStart, periodEnd;
                    if (taskReportView === "weekly") {
                      periodStart = getMondayOfWeek(taskReportWeek, taskReportWeekYear);
                      periodEnd = new Date(periodStart); periodEnd.setDate(periodEnd.getDate() + 6);
                    } else if (taskReportView === "monthly") {
                      periodStart = new Date(taskReportMonthYear, taskReportMonth, 1);
                      periodEnd = new Date(taskReportMonthYear, taskReportMonth + 1, 0);
                    } else {
                      periodStart = new Date(taskReportYear, 0, 1);
                      periodEnd = new Date(taskReportYear, 11, 31);
                    }
                    const ps = dateStr(periodStart), pe = dateStr(periodEnd);

                    const completedInPeriod = tasks.filter(t => t.status === "completed" && t.completedDate && t.completedDate >= ps && t.completedDate <= pe);
                    const cancelledInPeriod = tasks.filter(t => t.status === "cancelled" && t.completedDate && t.completedDate >= ps && t.completedDate <= pe);
                    const createdInPeriod = tasks.filter(t => t.createdDate && t.createdDate >= ps && t.createdDate <= pe);
                    const dueInPeriod = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled" && t.dueDate && t.dueDate >= ps && t.dueDate <= pe);

                    const trackedEntries = [];
                    const cursor = new Date(periodStart);
                    while (cursor <= periodEnd) {
                      const entries = getEntriesForDate(new Date(cursor));
                      entries.forEach(e => {
                        const s = parseTime(e.start), en = parseTime(e.end);
                        if (s !== null && en !== null && (e.taskId || e.note)) {
                          trackedEntries.push({ ...e, date: dateStr(cursor), hours: en - s });
                        }
                      });
                      cursor.setDate(cursor.getDate() + 1);
                    }

                    const taskTimeMap = {};
                    trackedEntries.forEach(e => {
                      const key = e.taskId || e.note;
                      if (!taskTimeMap[key]) taskTimeMap[key] = { title: e.note || "", hours: 0, entries: [] };
                      taskTimeMap[key].hours += e.hours;
                      taskTimeMap[key].entries.push(e);
                    });

                    const totalTrackedHrs = trackedEntries.reduce((s, e) => s + e.hours, 0);
                    const totalCompletedMins = completedInPeriod.reduce((s, t) => s + (t.duration || 0), 0);

                    return (
                      <div>
                        <div className="wht-grid-4col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                          {[
                            { label: "Completed", value: completedInPeriod.length, color: "#34a853", icon: "✓" },
                            { label: "Created", value: createdInPeriod.length, color: "#1a73e8", icon: "+" },
                            { label: "Cancelled", value: cancelledInPeriod.length, color: "#e37400", icon: "⊘" },
                            { label: "Still Due", value: dueInPeriod.length, color: "#d93025", icon: "📅" }
                          ].map(s => (
                            <div key={s.label} style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.icon} {s.value}</div>
                              <div style={{ fontSize: 12, color: "#5f6368", marginTop: 4 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>

                        <div className="wht-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: "#1a73e8" }}>{fmtH(totalTrackedHrs)}</div>
                            <div style={{ fontSize: 12, color: "#5f6368", marginTop: 4 }}>Hours Tracked on Tasks</div>
                          </div>
                          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: "#34a853" }}>{fmtGapTime(totalCompletedMins)}</div>
                            <div style={{ fontSize: 12, color: "#5f6368", marginTop: 4 }}>Estimated Time Completed</div>
                          </div>
                        </div>

                        {/* Completed tasks detail */}
                        {completedInPeriod.length > 0 && (
                          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#34a853", marginBottom: 10 }}>✓ Completed ({completedInPeriod.length})</div>
                            {completedInPeriod.sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || "")).map(task => (
                              <div key={task.id}>
                                <div onClick={() => setTaskReportExpanded(taskReportExpanded === task.id ? null : task.id)}
                                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer", borderRadius: 8, background: taskReportExpanded === task.id ? "#e6f4ea" : "transparent" }}
                                  onMouseEnter={e => { if (taskReportExpanded !== task.id) e.currentTarget.style.background = "#f8f9fa"; }}
                                  onMouseLeave={e => { if (taskReportExpanded !== task.id) e.currentTarget.style.background = "transparent"; }}>
                                  <span style={{ fontSize: 12, transform: taskReportExpanded === task.id ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▶</span>
                                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#202124" }}>{task.title}</span>
                                  {task.duration > 0 && <span style={{ fontSize: 11, color: "#a142f4", fontWeight: 600 }}>{fmtDuration(task.duration)}</span>}
                                  <span style={{ fontSize: 11, color: "#80868b" }}>{task.completedDate}</span>
                                  {task.project && <span style={{ fontSize: 11, color: "#5f6368", background: "#f1f3f4", padding: "2px 6px", borderRadius: 6 }}>{task.project}</span>}
                                </div>
                                {taskReportExpanded === task.id && (
                                  <div style={{ padding: "8px 10px 8px 28px", fontSize: 12, color: "#5f6368" }}>
                                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
                                      {task.activity && <span>Activity: <b>{task.activity}</b></span>}
                                      {task.customer && <span>Customer: <b>{task.customer}</b></span>}
                                      {task.workOrder && <span>WO: <b>{task.workOrder}</b></span>}
                                      <span>Importance: <b>{task.importance}★</b></span>
                                      {task.recurring && <span>🔄 {task.recurFrequency}</span>}
                                    </div>
                                    {task.createdDate && <div>Created: {task.createdDate}</div>}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Time tracked */}
                        {Object.keys(taskTimeMap).length > 0 && (
                          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8", marginBottom: 10 }}>⏱ Time Tracked ({Object.keys(taskTimeMap).length} items, {fmtH(totalTrackedHrs)})</div>
                            {Object.entries(taskTimeMap).sort((a, b) => b[1].hours - a[1].hours).map(([key, data]) => (
                              <div key={key}>
                                <div onClick={() => setTaskReportExpanded(taskReportExpanded === "t_" + key ? null : "t_" + key)}
                                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer", borderRadius: 8, background: taskReportExpanded === "t_" + key ? "#e8f0fe" : "transparent" }}
                                  onMouseEnter={e => { if (taskReportExpanded !== "t_" + key) e.currentTarget.style.background = "#f8f9fa"; }}
                                  onMouseLeave={e => { if (taskReportExpanded !== "t_" + key) e.currentTarget.style.background = "transparent"; }}>
                                  <span style={{ fontSize: 12, transform: taskReportExpanded === "t_" + key ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▶</span>
                                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#202124" }}>{data.title || "(no note)"}</span>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8" }}>{fmtH(data.hours)}</span>
                                  <span style={{ fontSize: 11, color: "#80868b" }}>{data.entries.length} session{data.entries.length !== 1 ? "s" : ""}</span>
                                </div>
                                {taskReportExpanded === "t_" + key && (
                                  <div style={{ padding: "4px 10px 8px 28px" }}>
                                    {data.entries.sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => (
                                      <div key={i} style={{ display: "flex", gap: 12, padding: "4px 0", fontSize: 12, color: "#5f6368", borderBottom: "1px solid #f1f3f4" }}>
                                        <span style={{ width: 80, flexShrink: 0 }}>{e.date}</span>
                                        <span>{e.start}–{e.end}</span>
                                        <span style={{ fontWeight: 600 }}>{fmtH(e.hours)}</span>
                                        {e.project && <span style={{ color: "#80868b" }}>{e.project}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Created tasks */}
                        {createdInPeriod.length > 0 && (
                          <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#5f6368", marginBottom: 10 }}>+ Created ({createdInPeriod.length})</div>
                            {createdInPeriod.map(task => (
                              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px" }}>
                                <span style={{ flex: 1, fontSize: 13, color: "#3c4043" }}>{task.title}</span>
                                <span style={{ fontSize: 11, color: "#80868b" }}>{task.createdDate}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: task.status === "completed" ? "#34a853" : task.status === "cancelled" ? "#e37400" : "#1a73e8" }}>
                                  {task.status === "completed" ? "✓" : task.status === "cancelled" ? "⊘" : task.status === "in_progress" ? "▶" : "○"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {completedInPeriod.length === 0 && Object.keys(taskTimeMap).length === 0 && createdInPeriod.length === 0 && (
                          <div style={{ textAlign: "center", padding: 40, color: "#80868b", background: "#fff", borderRadius: 12, border: "1px solid #dadce0" }}>
                            <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 8 }}>📊</div>
                            <div style={{ fontSize: 15 }}>No task activity in this period</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

          {/* ═══ MY DAY VIEW ═══ */}
          {taskView === "myday" && (
            <div>
              {/* Free time overview */}
              <div style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", marginBottom: 16,
                background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 12
              }}>
                <div style={{ fontSize: 18 }}>☀️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#202124" }}>My Day — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
                  <div style={{ fontSize: 13, color: "#5f6368", marginTop: 2 }}>
                    {fmtGapTime(totalFreeToday)} free across {todayFreeWindows.length} window{todayFreeWindows.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {/* Free windows */}
              {todayFreeWindows.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                  {todayFreeWindows.map((w, i) => (
                    <div key={i} style={{
                      padding: "6px 14px", background: "#e8f0fe", borderRadius: 10, border: "1px solid #d2e3fc",
                      fontSize: 12, fontWeight: 600, color: "#1a73e8"
                    }}>{w.from}–{w.to} ({fmtGapTime(w.mins)})</div>
                  ))}
                </div>
              )}

              {/* The Frog */}
              <div style={{
                padding: "14px 18px", marginBottom: 16,
                background: myDay.frog ? "#fff8e1" : "#ffffff",
                border: `1px solid ${myDay.frog ? "#f9a825" : "#e8eaed"}`, borderRadius: 12
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e37400", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  🐸 Eat the Frog
                  <span style={{ fontSize: 11, fontWeight: 400, color: "#80868b" }}>— your hardest/most important task first</span>
                </div>
                {myDay.frog && tasks.find(t => t.id === myDay.frog && t.status !== "completed") ? (() => {
                  const ft = tasks.find(t => t.id === myDay.frog);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#202124", flex: 1 }}>{ft.title}</span>
                      {ft.duration > 0 && <span style={{ fontSize: 12, color: "#a142f4", fontWeight: 600 }}>⏱ {fmtDuration(ft.duration)}</span>}
                      {ft.scheduledStart && ft.scheduledEnd && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 8, background: "#e6f4ea", color: "#137333" }}>📅 {ft.scheduledStart}–{ft.scheduledEnd}</span>
                      )}
                      <button onClick={() => scheduleTask(ft)} style={{
                        background: "#ffffff", border: "1px solid #1a73e8", color: "#1a73e8", padding: "5px 12px",
                        borderRadius: 14, cursor: "pointer", fontSize: 11, fontWeight: 600
                      }}>📅 Schedule</button>
                      {timerStatus === "stopped" && (
                        <button onClick={() => startTaskTimer(ft)} style={{
                          background: "#34a853", border: "none", color: "#fff", padding: "6px 14px",
                          borderRadius: 16, cursor: "pointer", fontSize: 12, fontWeight: 700
                        }}>▶ Start</button>
                      )}
                      <button onClick={() => setFrog("")} style={{
                        background: "transparent", border: "1px solid #dadce0", color: "#80868b",
                        padding: "4px 10px", borderRadius: 10, cursor: "pointer", fontSize: 11
                      }}>Clear</button>
                    </div>
                  );
                })() : (
                  <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>Select a task below and click 🐸 to set your Frog</div>
                )}
              </div>

              {/* Top 3 Priorities */}
              <div style={{
                padding: "14px 18px", marginBottom: 16,
                background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 12
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8" }}>🎯 Top 3 Priorities</div>
                  <span style={{ fontSize: 11, color: "#80868b" }}>Drag to reorder</span>
                </div>
                {[0, 1, 2].map(i => {
                  const tid = myDay.priorities[i];
                  const pt = tid ? tasks.find(t => t.id === tid && t.status !== "completed") : null;
                  return (
                    <div key={i}
                      draggable={!!pt}
                      onDragStart={e => { if (pt) { setPriDragIdx(i); e.dataTransfer.effectAllowed = "move"; } }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                      onDrop={e => { e.preventDefault(); if (priDragIdx !== null && priDragIdx !== i) { reorderPriority(priDragIdx, Math.min(i, myDay.priorities.length - 1)); } setPriDragIdx(null); }}
                      onDragEnd={() => setPriDragIdx(null)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        background: priDragIdx === i ? "#d2e3fc" : pt ? "#e8f0fe" : "#f8f9fa",
                        borderRadius: 8, marginBottom: 4,
                        border: priDragIdx !== null && priDragIdx !== i ? "2px dashed #1a73e860" : "2px solid transparent",
                        cursor: pt ? "grab" : "default", transition: "background 0.15s"
                      }}>
                      {pt && <span style={{ fontSize: 14, color: "#80868b", cursor: "grab", flexShrink: 0 }}>⠿</span>}
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8", width: 24, textAlign: "center", flexShrink: 0 }}>#{i + 1}</span>
                      {pt ? (
                        <>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#202124" }}>{pt.title}</span>
                          {pt.duration > 0 && <span style={{ fontSize: 11, color: "#a142f4", fontWeight: 600 }}>⏱ {fmtDuration(pt.duration)}</span>}
                          {pt.scheduledStart && pt.scheduledEnd && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: "#e6f4ea", color: "#137333" }}>📅 {pt.scheduledStart}–{pt.scheduledEnd}</span>
                          )}
                          <button onClick={() => scheduleTask(pt)} title="Schedule on calendar" style={{
                            background: "transparent", border: "1px solid #1a73e860", color: "#1a73e8", padding: "2px 6px",
                            borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, flexShrink: 0
                          }}>📅</button>
                          {timerStatus === "stopped" && (
                            <button onClick={() => startTaskTimer(pt)} style={{
                              background: "#34a853", border: "none", color: "#fff", padding: "4px 10px",
                              borderRadius: 12, cursor: "pointer", fontSize: 11, fontWeight: 700
                            }}>▶</button>
                          )}
                          <button onClick={() => togglePriority(pt.id)} style={{
                            background: "transparent", border: "1px solid #dadce0", color: "#80868b",
                            padding: "2px 8px", borderRadius: 8, cursor: "pointer", fontSize: 10
                          }}>×</button>
                        </>
                      ) : (
                        <span style={{ flex: 1, fontSize: 13, color: "#80868b", fontStyle: "italic" }}>Click 🎯 on a task below to set priority #{i + 1}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Recommended schedule */}
              <div style={{
                padding: "14px 18px", marginBottom: 16,
                background: "#f9f5ff", border: "1px solid #d4b8f0", borderRadius: 12
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed", marginBottom: 10 }}>💡 Recommended Schedule</div>
                {myDaySchedule.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>
                    {totalFreeToday <= 0 ? "No free time remaining today" : "Set durations on tasks to see schedule recommendations"}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {myDaySchedule.map(({ task, window: win }, i) => {
                      const urg = getUrgency(task);
                      const isFrog = myDay.frog === task.id;
                      const priIdx = myDay.priorities.indexOf(task.id);
                      return (
                        <div key={task.id + i} style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
                          background: isFrog ? "#fff8e1" : "#ffffff", borderRadius: 8, border: "1px solid #e8eaed"
                        }}>
                          <div style={{ fontSize: 11, color: "#5f6368", fontWeight: 600, width: 50, flexShrink: 0 }}>{win.from}</div>
                          <button onClick={() => setFrog(task.id)} title="Set as Frog" style={{
                            background: "transparent", border: "none", cursor: "pointer", fontSize: 13, padding: 0,
                            opacity: isFrog ? 1 : 0.3, filter: isFrog ? "none" : "grayscale(1)", flexShrink: 0
                          }}>🐸</button>
                          <button onClick={() => togglePriority(task.id)} title={priIdx >= 0 ? `Priority #${priIdx+1}` : "Add to top 3"} style={{
                            background: "transparent", border: "none", cursor: "pointer", fontSize: 12, padding: 0,
                            opacity: priIdx >= 0 ? 1 : 0.3, color: "#1a73e8", flexShrink: 0, fontWeight: 700
                          }}>{priIdx >= 0 ? `#${priIdx+1}` : "🎯"}</button>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#202124" }}>{task.title}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: urg.color + "18", color: urg.color }}>{urg.label}</span>
                          <span style={{ fontSize: 11, color: "#a142f4", fontWeight: 600 }}>{fmtDuration(task.duration)}</span>
                          {task.scheduledStart && task.scheduledEnd && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: "#e6f4ea", color: "#137333" }}>📅 {task.scheduledStart}</span>
                          )}
                          <button onClick={() => scheduleTask(task)} title="Schedule on calendar" style={{
                            background: "transparent", border: "1px solid #1a73e860", color: "#1a73e8", padding: "2px 6px",
                            borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, flexShrink: 0
                          }}>📅</button>
                          {timerStatus === "stopped" && (
                            <button onClick={() => startTaskTimer(task)} style={{
                              background: "#34a853", border: "none", color: "#fff", padding: "3px 10px",
                              borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 700
                            }}>▶</button>
                          )}
                          <button onClick={() => completeTask(task.id)} title="Mark complete" style={{
                            background: "#e6f4ea", border: "1px solid #34a853", color: "#137333",
                            padding: "2px 6px", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, flexShrink: 0
                          }}>✓</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Due Today */}
              <div style={{
                padding: "14px 18px", marginBottom: 16,
                background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 12
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#d93025", marginBottom: 8 }}>📅 Due Today ({dueTodayTasks.length})</div>
                {dueTodayTasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>Nothing due today</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {dueTodayTasks.map(task => {
                      const urg = getUrgency(task);
                      const pri = (urg.score * (task.importance || 1)).toFixed(1);
                      const isFrog = myDay.frog === task.id;
                      const priIdx = myDay.priorities.indexOf(task.id);
                      return (
                        <div key={task.id} style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
                          background: isFrog ? "#fff8e1" : "#fce8e6", borderRadius: 8
                        }}>
                          <button onClick={() => setFrog(task.id)} title="Set as Frog" style={{
                            background: "transparent", border: "none", cursor: "pointer", fontSize: 13, padding: 0,
                            opacity: isFrog ? 1 : 0.3, filter: isFrog ? "none" : "grayscale(1)", flexShrink: 0
                          }}>🐸</button>
                          <button onClick={() => togglePriority(task.id)} title={priIdx >= 0 ? `Priority #${priIdx+1}` : "Add to top 3"} style={{
                            background: "transparent", border: "none", cursor: "pointer", fontSize: 12, padding: 0,
                            opacity: priIdx >= 0 ? 1 : 0.3, color: "#1a73e8", flexShrink: 0, fontWeight: 700
                          }}>{priIdx >= 0 ? `#${priIdx+1}` : "🎯"}</button>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#202124" }}>{task.title}</span>
                          {task.duration > 0 && <span style={{ fontSize: 11, color: "#a142f4", fontWeight: 600 }}>{fmtDuration(task.duration)}</span>}
                          {task.scheduledStart && task.scheduledEnd && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: "#e6f4ea", color: "#137333" }}>📅 {task.scheduledStart}–{task.scheduledEnd}</span>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#e37400" }}>P: {pri}</span>
                          <button onClick={() => scheduleTask(task)} title="Schedule on calendar" style={{
                            background: "transparent", border: "1px solid #1a73e860", color: "#1a73e8", padding: "2px 6px",
                            borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, flexShrink: 0
                          }}>📅</button>
                          {timerStatus === "stopped" && (
                            <button onClick={() => startTaskTimer(task)} style={{
                              background: "#34a853", border: "none", color: "#fff", padding: "3px 10px",
                              borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 700
                            }}>▶</button>
                          )}
                          <button onClick={() => completeTask(task.id)} title="Mark complete" style={{
                            background: "#e6f4ea", border: "1px solid #34a853", color: "#137333",
                            padding: "2px 6px", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, flexShrink: 0
                          }}>✓</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* All active tasks with Frog and Priority assignment */}
              <div style={{ fontSize: 14, fontWeight: 700, color: "#5f6368", marginBottom: 8 }}>All Active Tasks</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tasks.filter(t => t.status !== "completed").sort((a, b) => {
                  const pa = getUrgency(a).score * (a.importance || 1);
                  const pb = getUrgency(b).score * (b.importance || 1);
                  return pb - pa;
                }).map(task => {
                  const urg = getUrgency(task);
                  const isFrog = myDay.frog === task.id;
                  const priIdx = myDay.priorities.indexOf(task.id);
                  return (
                    <div key={task.id} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                      background: isFrog ? "#fff8e1" : priIdx >= 0 ? "#e8f0fe" : "#ffffff",
                      border: `1px solid ${isFrog ? "#f9a825" : priIdx >= 0 ? "#1a73e840" : "#e8eaed"}`,
                      borderRadius: 10
                    }}>
                      {/* Frog button */}
                      <button onClick={() => setFrog(task.id)} title="Set as The Frog" style={{
                        background: "transparent", border: "none", cursor: "pointer", fontSize: 16, padding: 0,
                        opacity: isFrog ? 1 : 0.3, filter: isFrog ? "none" : "grayscale(1)"
                      }}>🐸</button>
                      {/* Priority button */}
                      <button onClick={() => togglePriority(task.id)} title={priIdx >= 0 ? `Priority #${priIdx + 1} (click to remove)` : "Add to top 3"} style={{
                        background: "transparent", border: "none", cursor: "pointer", fontSize: 14, padding: 0,
                        opacity: priIdx >= 0 ? 1 : 0.3, color: "#1a73e8"
                      }}>{priIdx >= 0 ? `#${priIdx + 1}` : "🎯"}</button>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#202124" }}>{task.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: urg.color + "18", color: urg.color }}>{urg.label}</span>
                      {task.duration > 0 && <span style={{ fontSize: 11, color: "#a142f4", fontWeight: 600 }}>{fmtDuration(task.duration)}</span>}
                      {task.scheduledStart && task.scheduledEnd && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: "#e6f4ea", color: "#137333" }}>📅 {task.scheduledStart}–{task.scheduledEnd}</span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#e37400" }}>P: {(urg.score * (task.importance || 1)).toFixed(1)}</span>
                      <button onClick={() => scheduleTask(task)} title="Schedule on calendar" style={{
                        background: "transparent", border: "1px solid #1a73e860", color: "#1a73e8", padding: "2px 6px",
                        borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, flexShrink: 0
                      }}>📅</button>
                      {timerStatus === "stopped" && (
                        <button onClick={() => startTaskTimer(task)} style={{
                          background: "#34a853", border: "none", color: "#fff", padding: "3px 10px",
                          borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 700
                        }}>▶</button>
                      )}
                      <button onClick={() => completeTask(task.id)} style={{
                        background: "#e6f4ea", border: "1px solid #34a853", color: "#137333",
                        padding: "2px 8px", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600
                      }}>✓</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ TASK LIST VIEW ═══ */}
          {taskView === "list" && (
          <>
          {/* Add task */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <NoteAutoComplete
                value={newTaskTitle}
                onChange={v => { setNewTaskTitle(v); setNewTaskEntry(null); }}
                noteHistory={noteHistory}
                placeholder="Add a new task..."
                onSelectEntry={entry => {
                  setNewTaskTitle(entry.note);
                  setNewTaskEntry(entry);
                }}
                onEnter={() => {
                  if (newTaskTitle.trim()) {
                    addTask(newTaskTitle, newTaskEntry);
                    setNewTaskTitle(""); setNewTaskEntry(null);
                  }
                }}
              />
            </div>
            <button onClick={() => {
              if (newTaskTitle.trim()) {
                addTask(newTaskTitle, newTaskEntry);
                setNewTaskTitle(""); setNewTaskEntry(null);
              }
            }} style={{
              background: "#1a73e8", border: "none", color: "#ffffff", padding: "12px 24px",
              borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 700,
              flexShrink: 0
            }}>+ Add Task</button>
          </div>

          {/* Time gap banner */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", marginBottom: 16,
            background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 12, flexWrap: "wrap"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: timeGap.available > 0 ? "#e8f0fe" : "#fce8e6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>{timeGap.available > 0 ? "⏳" : "📅"}</span>
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: timeGap.available > 60 ? "#1a73e8" : timeGap.available > 0 ? "#e37400" : "#d93025", fontFamily: "'Inter', 'Roboto', sans-serif" }}>
                  {fmtGapTime(timeGap.available)}
                </div>
                <div style={{ fontSize: 12, color: "#5f6368" }}>
                  {timeGap.inBlock ? `Free from ${timeGap.freeFrom}` : "Available now"}
                  {timeGap.nextBlock ? ` · Next block at ${timeGap.nextBlock}` : " · No more blocks today"}
                </div>
              </div>
            </div>
            <button onClick={() => setShowRecommendations(!showRecommendations)} style={{
              marginLeft: "auto", background: showRecommendations ? "#a142f4" : "#ffffff",
              border: `1px solid ${showRecommendations ? "#a142f4" : "#dadce0"}`,
              color: showRecommendations ? "#fff" : "#a142f4", padding: "8px 18px",
              borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif",
              fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexShrink: 0
            }}>
              💡 {showRecommendations ? "Hide" : "Recommend"}
            </button>
          </div>

          {/* Recommendations panel */}
          {showRecommendations && (
            <div style={{
              marginBottom: 16, padding: "16px 18px",
              background: "#f9f5ff", border: "1px solid #d4b8f0", borderRadius: 12
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed", marginBottom: 10 }}>
                💡 Recommended for your {fmtGapTime(timeGap.available)} window
              </div>
              {recommendations.length === 0 ? (
                <div style={{ fontSize: 13, color: "#80868b", fontStyle: "italic" }}>
                  {timeGap.available <= 0 ? "No free time until your next block" : "No tasks with durations match this window. Set durations on your tasks to get recommendations."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recommendations.map((rec, ri) => (
                    <div key={ri} style={{
                      background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 10,
                      padding: "12px 16px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: rec.tasks.length > 1 ? 8 : 0 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                          background: rec.type === "single" ? "#e8f0fe" : "#e6f4ea",
                          color: rec.type === "single" ? "#1a73e8" : "#137333"
                        }}>
                          {rec.type === "single" ? "Single task" : `${rec.tasks.length} tasks`}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#a142f4" }}>⏱ {fmtGapTime(rec.totalMins)}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#e37400" }}>P: {rec.totalPriority.toFixed(1)}</span>
                        {rec.type === "single" && timerStatus === "stopped" && (
                          <button onClick={() => { startTaskTimer(rec.tasks[0]); setShowRecommendations(false); }} style={{
                            marginLeft: "auto", background: "#34a853", border: "none", color: "#fff",
                            padding: "4px 12px", borderRadius: 12, cursor: "pointer", fontSize: 11, fontWeight: 700
                          }}>▶ Start</button>
                        )}
                      </div>
                      {rec.tasks.map(t => {
                        const urg = getUrgency(t);
                        return (
                          <div key={t.id} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: rec.tasks.length > 1 ? "6px 0" : 0,
                            borderTop: rec.tasks.length > 1 ? "1px solid #f1f3f4" : "none"
                          }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#202124", flex: 1 }}>{t.title}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: urg.color + "18", color: urg.color }}>{urg.label}</span>
                            <span style={{ fontSize: 11, color: "#a142f4", fontWeight: 600 }}>{fmtDuration(t.duration)}</span>
                            {rec.tasks.length > 1 && timerStatus === "stopped" && (
                              <button onClick={() => { startTaskTimer(t); setShowRecommendations(false); }} style={{
                                background: "#34a853", border: "none", color: "#fff",
                                padding: "3px 10px", borderRadius: 10, cursor: "pointer", fontSize: 10, fontWeight: 700
                              }}>▶</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={taskSearch}
                onChange={e => setTaskSearch(e.target.value)}
                placeholder="Search tasks..."
                style={{
                  width: "100%", fontSize: 14, padding: "10px 14px 10px 36px",
                  border: "1px solid #dadce0", borderRadius: 10, outline: "none",
                  fontFamily: "'Inter', 'Roboto', sans-serif", color: "#202124",
                  background: "#ffffff", boxSizing: "border-box"
                }}
              />
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#80868b", pointerEvents: "none" }}>🔍</span>
              {taskSearch && (
                <button onClick={() => setTaskSearch("")} style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: "none", color: "#80868b", cursor: "pointer",
                  fontSize: 16, padding: 0, lineHeight: 1
                }}>✕</button>
              )}
            </div>
            {taskSearch && <div style={{ fontSize: 12, color: "#80868b", marginTop: 4 }}>{activeTasks.length} result{activeTasks.length !== 1 ? "s" : ""}</div>}
          </div>

          {/* Filters and sort */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#5f6368", fontWeight: 600 }}>Filter:</span>
            {[["all","All"],["not_started","Not Started"],["in_progress","In Progress"],["on_hold","On Hold"],["waiting","Waiting For"]].map(([k,l]) => (
              <button key={k} onClick={() => setTaskFilter(k)} style={{
                fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 16, cursor: "pointer",
                background: taskFilter === k ? "#1a73e8" : "#fff",
                color: taskFilter === k ? "#fff" : "#5f6368",
                border: `1px solid ${taskFilter === k ? "#1a73e8" : "#dadce0"}`
              }}>{l}</button>
            ))}
            <div style={{ width: 1, height: 20, background: "#dadce0", margin: "0 4px" }} />
            <span style={{ fontSize: 13, color: "#5f6368", fontWeight: 600 }}>Sort:</span>
            {[["priority","Priority"],["due","Due Date"],["title","Title"],["manual","Manual ↕"]].map(([k,l]) => (
              <button key={k} onClick={() => setTaskSort(k)} style={{
                fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 16, cursor: "pointer",
                background: taskSort === k ? "#e8f0fe" : "#fff",
                color: taskSort === k ? "#1a73e8" : "#5f6368",
                border: `1px solid ${taskSort === k ? "#1a73e8" : "#dadce0"}`
              }}>{l}</button>
            ))}
            <div style={{ width: 1, height: 20, background: "#dadce0", margin: "0 4px" }} />
            <span style={{ fontSize: 13, color: "#5f6368", fontWeight: 600 }}>Duration:</span>
            <button onClick={() => setTaskDurationFilter(0)} style={{
              fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 16, cursor: "pointer",
              background: taskDurationFilter === 0 ? "#a142f4" : "#fff",
              color: taskDurationFilter === 0 ? "#fff" : "#5f6368",
              border: `1px solid ${taskDurationFilter === 0 ? "#a142f4" : "#dadce0"}`
            }}>All</button>
            {DURATION_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setTaskDurationFilter(taskDurationFilter === o.value ? 0 : o.value)} style={{
                fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 16, cursor: "pointer",
                background: taskDurationFilter === o.value ? "#a142f4" : "#fff",
                color: taskDurationFilter === o.value ? "#fff" : "#5f6368",
                border: `1px solid ${taskDurationFilter === o.value ? "#a142f4" : "#dadce0"}`
              }}>{o.label}</button>
            ))}
            <div style={{ width: 1, height: 20, background: "#dadce0", margin: "0 4px" }} />
            <span style={{ fontSize: 13, color: "#5f6368", fontWeight: 600 }}>Group:</span>
            {[["none","None"],["project","Project"],["customer","Customer"],["workOrder","Work Order"]].map(([k,l]) => (
              <button key={k} onClick={() => setTaskGroupBy(k)} style={{
                fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 16, cursor: "pointer",
                background: taskGroupBy === k ? "#e8f0fe" : "#fff",
                color: taskGroupBy === k ? "#1a73e8" : "#5f6368",
                border: `1px solid ${taskGroupBy === k ? "#1a73e8" : "#dadce0"}`
              }}>{l}</button>
            ))}
          </div>

          {/* Task templates */}
          {(config.taskTemplates || []).length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#5f6368", fontWeight: 600 }}>Templates:</span>
              {(config.taskTemplates || []).map((tmpl, i) => (
                <button key={i} onClick={() => addTaskFromTemplate(tmpl)} style={{
                  fontSize: 12, padding: "4px 12px", borderRadius: 16, cursor: "pointer",
                  background: "#fff", color: "#1a73e8", border: "1px solid #1a73e8", fontWeight: 500
                }}>+ {tmpl.title}</button>
              ))}
            </div>
          )}

          {/* Batch action bar */}
          {batchSelected.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", marginBottom: 8, background: "#e8f0fe", borderRadius: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a73e8" }}>{batchSelected.size} selected</span>
              <button onClick={() => setBatchSelected(new Set())} style={{ fontSize: 11, color: "#5f6368", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>Clear</button>
              <button onClick={() => { const all = new Set(activeTasks.map(t => t.id)); setBatchSelected(all); }} style={{ fontSize: 11, color: "#1a73e8", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>Select all</button>
              <div style={{ width: 1, height: 20, background: "#d2e3fc" }} />
              <span style={{ fontSize: 12, color: "#5f6368" }}>Status:</span>
              {[["not_started","○"],["in_progress","▶"],["on_hold","⏸"],["waiting","⏳"]].map(([k,ico]) => (
                <button key={k} onClick={() => { batchSelected.forEach(id => updateTask(id, { status: k })); setBatchSelected(new Set()); }}
                  style={{ fontSize: 12, padding: "3px 10px", borderRadius: 8, cursor: "pointer", background: "#fff", border: "1px solid #dadce0", color: "#202124" }}>{ico}</button>
              ))}
              <div style={{ width: 1, height: 20, background: "#d2e3fc" }} />
              <select onChange={e => { if (e.target.value) { batchSelected.forEach(id => updateTask(id, { project: e.target.value })); setBatchSelected(new Set()); } e.target.value = ""; }}
                style={{ fontSize: 12, padding: "3px 8px", border: "1px solid #dadce0", borderRadius: 6, outline: "none", cursor: "pointer", color: "#80868b" }}>
                <option value="">Set project...</option>
                {getItemNames(activeConfig.projects).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select onChange={e => { if (e.target.value) { batchSelected.forEach(id => updateTask(id, { dueDate: e.target.value })); setBatchSelected(new Set()); } e.target.value = ""; }}
                style={{ fontSize: 12, padding: "3px 8px", border: "1px solid #dadce0", borderRadius: 6, outline: "none", cursor: "pointer", color: "#80868b" }}>
                <option value="">Set due date...</option>
                <option value={dateStr(new Date())}>Today</option>
                <option value={(() => { const d = new Date(); d.setDate(d.getDate()+1); return dateStr(d); })()}>Tomorrow</option>
                <option value={(() => { const d = new Date(); d.setDate(d.getDate()+(5-((d.getDay()+6)%7))); return dateStr(d); })()}>This Friday</option>
              </select>
              <div style={{ width: 1, height: 20, background: "#d2e3fc" }} />
              <button onClick={() => { batchSelected.forEach(id => completeTask(id)); setBatchSelected(new Set()); }}
                style={{ fontSize: 12, fontWeight: 600, padding: "3px 12px", borderRadius: 8, cursor: "pointer", background: "#34a853", border: "none", color: "#fff" }}>✓ Done</button>
              <button onClick={() => { batchSelected.forEach(id => deleteTask(id)); setBatchSelected(new Set()); }}
                style={{ fontSize: 12, fontWeight: 600, padding: "3px 12px", borderRadius: 8, cursor: "pointer", background: "#d93025", border: "none", color: "#fff" }}>🗑 Delete</button>
            </div>
          )}

          {/* Task list */}
          {activeTasks.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#80868b", background: "#fff", borderRadius: 12, border: "1px solid #dadce0" }}>
              <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 15 }}>{taskFilter === "all" ? "No tasks yet — add one above" : "No tasks match this filter"}</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(() => {
              const displayTasks = newTaskId && editingTaskId === newTaskId ? [activeTasks.find(t => t.id === newTaskId), ...activeTasks.filter(t => t.id !== newTaskId)].filter(Boolean) : activeTasks;
              if (taskGroupBy === "none") return displayTasks;
              // Group by project or customer
              const groups = {};
              displayTasks.forEach(t => {
                const key = (taskGroupBy === "project" ? t.project : taskGroupBy === "workOrder" ? t.workOrder : t.customer) || "(No " + (taskGroupBy === "workOrder" ? "work order" : taskGroupBy) + ")";
                if (!groups[key]) groups[key] = [];
                groups[key].push(t);
              });
              return Object.entries(groups).flatMap(([group, gTasks], gi) => [
                { _groupHeader: true, label: group, count: gTasks.length, key: `gh_${gi}` },
                ...gTasks
              ]);
            })().map(item => {
              if (item._groupHeader) return (
                <div key={item.key} style={{ fontSize: 13, fontWeight: 700, color: "#1a73e8", padding: "10px 14px 4px", textTransform: "uppercase", letterSpacing: "0.5px", borderTop: "2px solid #e8eaed", marginTop: 8 }}>
                  {item.label} <span style={{ fontSize: 11, fontWeight: 500, color: "#80868b" }}>({item.count})</span>
                </div>
              );
              const task = item;
              const urg = getUrgency(task);
              const priority = (urg.score * (task.importance || 1)).toFixed(1);
              const statusColors = { not_started: { bg: "#f1f3f4", text: "#5f6368", label: "Not Started" }, in_progress: { bg: "#e8f0fe", text: "#1a73e8", label: "In Progress" }, on_hold: { bg: "#fef7e0", text: "#e37400", label: "On Hold" }, waiting: { bg: "#f3e8fd", text: "#8b5cf6", label: "Waiting For" } };
              const st = statusColors[task.status] || statusColors.not_started;
              const isEditing = editingTaskId === task.id;

              if (!isEditing) {
                // ═══ COMPACT VIEW ═══
                const missing = [];
                if (!task.dueDate) missing.push("due");
                if (!task.duration) missing.push("dur");
                if (!task.project) missing.push("proj");
                if (!task.activity) missing.push("act");
                if (!task.workOrder) missing.push("WO");
                if (!task.customer) missing.push("cust");
                return (
                  <div key={task.id} draggable={taskSort === "manual"}
                    onDragStart={taskSort === "manual" ? e => { setTaskDragId(task.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
                    onDragOver={taskSort === "manual" ? e => e.preventDefault() : undefined}
                    onDrop={taskSort === "manual" ? e => { e.preventDefault(); if (taskDragId && taskDragId !== task.id) { setTasks(prev => { const arr = [...prev]; const fi = arr.findIndex(t => t.id === taskDragId); const ti = arr.findIndex(t => t.id === task.id); if (fi < 0 || ti < 0) return prev; const [moved] = arr.splice(fi, 1); arr.splice(ti, 0, moved); return arr; }); setTaskDragId(null); } } : undefined}
                    onDragEnd={() => setTaskDragId(null)}
                    style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
                    background: batchSelected.has(task.id) ? "#e8f0fe" : "#ffffff",
                    border: `1px solid ${missing.length > 3 ? "#e3740040" : "#e8eaed"}`, borderRadius: 10,
                    flexWrap: "wrap", opacity: taskDragId === task.id ? 0.4 : 1,
                    cursor: taskSort === "manual" ? "grab" : "default"
                  }}>
                    <input type="checkbox" checked={batchSelected.has(task.id)} onChange={() => setBatchSelected(prev => { const s = new Set(prev); s.has(task.id) ? s.delete(task.id) : s.add(task.id); return s; })}
                      onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, accentColor: "#1a73e8", cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, padding: "3px 8px", borderRadius: 8, background: st.bg, color: st.text, flexShrink: 0 }}>{st.label === "Not Started" ? "○" : st.label === "In Progress" ? "▶" : st.label === "Waiting For" ? "⏳" : "⏸"}</span>
                    <span onClick={() => setEditingTaskId(task.id)} style={{
                      flex: 1, fontSize: 14, fontWeight: 600, color: "#202124", cursor: "pointer",
                      ...(isMobile
                        ? { flexBasis: "100%", minWidth: 0, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }
                        : { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", minWidth: 80 }),
                    }}
                      onMouseEnter={e => !isMobile && (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={e => !isMobile && (e.currentTarget.style.textDecoration = "none")}
                    >{task.title}</span>
                    {/* Urgent / Now toggles */}
                    <button onClick={e => { e.stopPropagation(); updateTask(task.id, { urgent: !task.urgent }); }} title={task.urgent ? "Remove urgent" : "Mark urgent"} style={{
                      fontSize: 14, fontWeight: 700, padding: "4px 8px", borderRadius: 10, cursor: "pointer", flexShrink: 0,
                      background: task.urgent ? "#c5221f" : "transparent", color: task.urgent ? "#fff" : "#80868b",
                      border: `1px solid ${task.urgent ? "#c5221f" : "#dadce0"}`
                    }}>⚠️</button>
                    <button onClick={e => { e.stopPropagation(); setTaskNow(task.id); }} title={task.doNow ? "Remove now" : "Mark as now"} style={{
                      fontSize: 14, fontWeight: 700, padding: "4px 8px", borderRadius: 10, cursor: "pointer", flexShrink: 0,
                      background: task.doNow ? "#d93025" : "transparent", color: task.doNow ? "#fff" : "#80868b",
                      border: `1px solid ${task.doNow ? "#d93025" : "#dadce0"}`
                    }}>🔥</button>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 10, background: urg.color + "18", color: urg.color }}>{urg.label}</span>
                    {isMobile ? (
                      <span onClick={e => { e.stopPropagation(); updateTask(task.id, { importance: (task.importance || 1) >= 5 ? 1 : (task.importance || 1) + 1 }); }}
                        style={{ fontSize: 14, fontWeight: 600, color: "#fbbc04", flexShrink: 0, cursor: "pointer" }}>★{task.importance || 1}</span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 1, flexShrink: 0 }}>
                        {[1,2,3,4,5].map(v => (
                          <span key={v} onClick={e => { e.stopPropagation(); updateTask(task.id, { importance: v }); }}
                            style={{ fontSize: 20, cursor: "pointer", color: v <= (task.importance || 1) ? "#fbbc04" : "#dadce0", lineHeight: 1 }}
                            onMouseEnter={e => e.currentTarget.style.transform = "scale(1.3)"}
                            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                          >★</span>
                        ))}
                      </span>
                    )}
                    {task.duration > 0 && <span style={{ fontSize: 12, color: "#a142f4", fontWeight: 600, flexShrink: 0 }}>⏱ {fmtDuration(task.duration)}</span>}
                    {task.scheduledStart && !isMobile && <span style={{ fontSize: 12, color: "#137333", fontWeight: 600, flexShrink: 0 }}>📅 {task.scheduledStart}</span>}
                    {task.recurring && <span style={{ fontSize: 14, color: "#1a73e8", flexShrink: 0 }}>🔄</span>}
                    {(task.tags || []).length > 0 && !isMobile && <span style={{ fontSize: 12, color: "#24c1e0", fontWeight: 600, flexShrink: 0 }}>🏷{task.tags.length}</span>}
                    {task.notes && !isMobile && <span style={{ fontSize: 14, color: "#5f6368", flexShrink: 0 }} title={task.notes.substring(0, 100)}>📝</span>}
                    {(task.subtasks || []).length > 0 && <span style={{ fontSize: 12, color: (task.subtasks || []).every(s => s.done) ? "#34a853" : "#5f6368", fontWeight: 600, flexShrink: 0 }}>☑{(task.subtasks || []).filter(s => s.done).length}/{(task.subtasks || []).length}</span>}
                    {task.delegatedTo && <span style={{ fontSize: 12, color: "#8b5cf6", flexShrink: 0 }} title={`Delegated to ${task.delegatedTo}`}>👤</span>}
                    {task.blockedBy && tasks.some(t => t.id === task.blockedBy && t.status !== "completed") && <span style={{ fontSize: 12, color: "#d93025", flexShrink: 0 }} title="Blocked">🚫</span>}
                    {(() => { const age = taskAge(task); return age > 14 && !isMobile ? <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 8, flexShrink: 0, background: age > 30 ? "#fce8e6" : "#fef7e0", color: age > 30 ? "#d93025" : "#e37400" }}>{age}d</span> : null; })()}
                    <span style={{
                      fontSize: 13, fontWeight: 700, padding: "3px 10px", borderRadius: 10, flexShrink: 0,
                      background: priority >= 15 ? "#d9302518" : priority >= 8 ? "#e3740018" : "#34a85318",
                      color: priority >= 15 ? "#d93025" : priority >= 8 ? "#e37400" : "#34a853"
                    }}>P:{priority}</span>
                    {/* Missing fields indicator */}
                    {missing.length > 0 && !isMobile && (
                      <span title={`Missing: ${missing.join(", ")}`} style={{
                        fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 10, flexShrink: 0,
                        background: missing.length > 3 ? "#fce8e6" : "#fef7e0",
                        color: missing.length > 3 ? "#d93025" : "#e37400"
                      }}>⚠ {missing.length}</span>
                    )}
                    {timerStatus === "stopped" && (
                      <button onClick={e => { e.stopPropagation(); startTaskTimer(task); }} style={{
                        background: "#34a853", border: "none", color: "#fff", padding: "5px 12px",
                        borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, flexShrink: 0
                      }}>▶</button>
                    )}
                    <button onClick={e => { e.stopPropagation(); completeTask(task.id); }} title="Done" style={{
                      background: "#e6f4ea", border: "1px solid #34a853", color: "#137333", padding: "4px 10px",
                      borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, flexShrink: 0
                    }}>✓</button>
                  </div>
                );
              }

              // ═══ EXPANDED EDIT VIEW ═══
              return (
                <div key={task.id} tabIndex={-1} onKeyDown={e => {
                  if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); setEditingTaskId(null); }
                }} style={{
                  background: "#ffffff", border: "2px solid #1a73e8", borderRadius: 12,
                  padding: "16px 18px", boxShadow: "0 2px 8px rgba(26,115,232,0.15)",
                  outline: "none"
                }}>
                  {/* Header with collapse */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <NoteAutoComplete
                        value={task.title}
                        onChange={v => updateTask(task.id, { title: v })}
                        noteHistory={noteHistory}
                        placeholder="Task title..."
                        onSelectEntry={entry => {
                          updateTask(task.id, {
                            title: entry.note,
                            ...(entry.activity ? { activity: entry.activity } : {}),
                            ...(entry.project ? { project: entry.project } : {}),
                            ...(entry.customer ? { customer: entry.customer } : {}),
                            ...(entry.workOrder ? { workOrder: entry.workOrder } : {}),
                            ...(entry.tags && entry.tags.length > 0 ? { tags: entry.tags } : {})
                          });
                        }}
                      />
                    </div>
                    <button onClick={() => setEditingTaskId(null)} style={{
                      background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "4px 14px",
                      borderRadius: 16, cursor: "pointer", fontSize: 12, fontWeight: 600
                    }}>Collapse ▲</button>
                  </div>

                  {/* Status + Urgency + Due */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                    <select value={task.status} onChange={e => updateTask(task.id, { status: e.target.value })}
                      style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 10, border: `1px solid ${st.text}`, background: st.bg, color: st.text, cursor: "pointer", outline: "none" }}>
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="on_hold">On Hold</option>
                    </select>
                    <button onClick={() => updateTask(task.id, { urgent: !task.urgent })} style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, cursor: "pointer",
                      background: task.urgent ? "#c5221f" : "transparent", color: task.urgent ? "#fff" : "#80868b",
                      border: `1px solid ${task.urgent ? "#c5221f" : "#dadce0"}`
                    }}>⚠️ Urgent</button>
                    <button onClick={() => setTaskNow(task.id)} style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, cursor: "pointer",
                      background: task.doNow ? "#d93025" : "transparent", color: task.doNow ? "#fff" : "#80868b",
                      border: `1px solid ${task.doNow ? "#d93025" : "#dadce0"}`
                    }}>🔥 Now</button>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "#80868b" }}>Start:</span>
                      <input type="date" value={task.startDate || ""} onChange={e => updateTask(task.id, { startDate: e.target.value })}
                        style={{ fontSize: 12, border: "1px solid #dadce0", borderRadius: 6, padding: "2px 6px", outline: "none", color: task.startDate ? "#202124" : "#80868b", background: "#fff", cursor: "pointer" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "#80868b" }}>Due:</span>
                      <input type="date" value={task.dueDate || ""} onChange={e => updateTask(task.id, { dueDate: e.target.value })}
                        style={{ fontSize: 12, border: "1px solid #dadce0", borderRadius: 6, padding: "2px 6px", outline: "none", color: task.dueDate ? "#202124" : "#80868b", background: "#fff", cursor: "pointer" }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10, background: urg.color + "18", color: urg.color }}>⏰ {urg.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {[1,2,3,4,5].map(v => (
                        <span key={v} onClick={() => updateTask(task.id, { importance: v })}
                          style={{ cursor: "pointer", fontSize: 24, color: v <= (task.importance || 1) ? "#fbbc04" : "#dadce0", lineHeight: 1, transition: "transform 0.1s" }}
                          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
                          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                        >★</span>
                      ))}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
                      background: priority >= 15 ? "#d9302518" : priority >= 8 ? "#e3740018" : "#34a85318",
                      color: priority >= 15 ? "#d93025" : priority >= 8 ? "#e37400" : "#34a853"
                    }}>P: {priority}</span>
                  </div>

                  {/* Duration + Recurring */}
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "#80868b", marginRight: 2 }}>Duration:</span>
                    {DURATION_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => updateTask(task.id, { duration: (task.duration || 0) === o.value ? 0 : o.value })} style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, cursor: "pointer",
                        background: (task.duration || 0) === o.value ? "#a142f4" : "transparent",
                        color: (task.duration || 0) === o.value ? "#fff" : "#80868b",
                        border: `1px solid ${(task.duration || 0) === o.value ? "#a142f4" : "#e8eaed"}`
                      }}>{o.label}</button>
                    ))}
                    <div style={{ width: 1, height: 16, background: "#e8eaed", margin: "0 4px" }} />
                    <span style={{ fontSize: 11, color: "#80868b" }}>Recurring:</span>
                    <button onClick={() => updateTask(task.id, { recurring: !task.recurring, recurFrequency: !task.recurring ? "weekly" : "" })} style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, cursor: "pointer",
                      background: task.recurring ? "#1a73e8" : "transparent", color: task.recurring ? "#fff" : "#80868b",
                      border: `1px solid ${task.recurring ? "#1a73e8" : "#e8eaed"}`
                    }}>🔄 {task.recurring ? "On" : "Off"}</button>
                    {task.recurring && (
                      <select value={task.recurFrequency || "weekly"} onChange={e => updateTask(task.id, { recurFrequency: e.target.value })}
                        style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, border: "1px solid #1a73e8", background: "#e8f0fe", color: "#1a73e8", cursor: "pointer", outline: "none" }}>
                        <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="annually">Annually</option>
                      </select>
                    )}
                  </div>

                  {/* Dropdowns + Actions */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <FavSel small value={task.workOrder} onChange={v => {
                      if (v) { const chain = lookupWorkOrderChain(v); updateTask(task.id, { workOrder: v, ...(chain.project ? { project: chain.project } : {}), ...(chain.customer ? { customer: chain.customer } : {}) }); }
                      else updateTask(task.id, { workOrder: "" });
                    }} options={getWorkOrdersForProject(task.project)} configItems={activeConfig.workOrders} placeholder="Work Order..." />
                    <FavSel small value={task.activity} onChange={v => updateTask(task.id, { activity: v })}
                      options={getActivitiesForProject(task.project)} favouriteNames={config.favouriteActivities || []} placeholder="Activity..." />
                    <FavSel small value={task.project} onChange={v => updateTask(task.id, { project: v, workOrder: "" })}
                      options={getItemNames(activeConfig.projects)} configItems={activeConfig.projects} placeholder="Project..." />
                    <FavSel small value={task.customer} onChange={v => updateTask(task.id, { customer: v, project: "", workOrder: "" })}
                      options={getItemNames(activeConfig.customers)} configItems={activeConfig.customers} placeholder="Customer..." />
                    <div style={{ width: "100%", marginTop: 4 }}>
                      <TagMultiSelect
                        selected={task.tags || []}
                        onChange={v => updateTask(task.id, { tags: v })}
                        options={activeConfig.tags}
                        favouriteNames={config.favouriteTags || []}
                        tagCategories={config.tagCategories}
                      />
                    </div>
                    {/* Supporting Notes */}
                    <div style={{ width: "100%", marginTop: 6 }}>
                      <div style={{ fontSize: 11, color: "#80868b", marginBottom: 3 }}>Supporting Notes</div>
                      <textarea
                        value={task.notes || ""}
                        onChange={e => updateTask(task.id, { notes: e.target.value })}
                        onKeyDown={e => { if (e.key === "Enter") e.stopPropagation(); }}
                        placeholder="Add notes, links, or references..."
                        rows={2}
                        style={{
                          width: "100%", fontSize: 13, fontFamily: "'Inter', 'Roboto', sans-serif",
                          border: "1px solid #dadce0", borderRadius: 8, padding: "6px 10px",
                          outline: "none", resize: "vertical", color: "#202124", background: "#fafafa",
                          boxSizing: "border-box"
                        }}
                      />
                      {task.notes && (() => {
                        const urlRegex = /(https?:\/\/[^\s]+)/g;
                        const links = task.notes.match(urlRegex);
                        if (!links || links.length === 0) return null;
                        return (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {links.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: 11, color: "#1a73e8", textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 250, whiteSpace: "nowrap", display: "inline-block" }}>
                                🔗 {url.replace(/^https?:\/\/(www\.)?/, "").substring(0, 40)}
                              </a>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Subtasks / Checklist */}
                    <div style={{ width: "100%", marginTop: 6 }}>
                      <div style={{ fontSize: 11, color: "#80868b", marginBottom: 3 }}>Subtasks {(task.subtasks || []).length > 0 && `(${(task.subtasks || []).filter(s => s.done).length}/${(task.subtasks || []).length})`}</div>
                      {(task.subtasks || []).map((sub, si) => (
                        <div key={sub.id || si} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                          <input type="checkbox" checked={sub.done} onChange={() => {
                            const subs = [...(task.subtasks || [])]; subs[si] = { ...subs[si], done: !subs[si].done }; updateTask(task.id, { subtasks: subs });
                          }} style={{ accentColor: "#34a853", width: 16, height: 16, cursor: "pointer" }} />
                          <input value={sub.title} onChange={e => {
                            const subs = [...(task.subtasks || [])]; subs[si] = { ...subs[si], title: e.target.value }; updateTask(task.id, { subtasks: subs });
                          }} onKeyDown={e => e.stopPropagation()}
                            style={{ flex: 1, fontSize: 13, border: "none", borderBottom: "1px solid #e8eaed", outline: "none", padding: "2px 4px", textDecoration: sub.done ? "line-through" : "none", color: sub.done ? "#80868b" : "#202124" }} />
                          <button onClick={() => { const subs = (task.subtasks || []).filter((_, i) => i !== si); updateTask(task.id, { subtasks: subs }); }}
                            style={{ background: "transparent", border: "none", color: "#80868b", cursor: "pointer", fontSize: 14 }}>×</button>
                        </div>
                      ))}
                      <button onClick={() => {
                        const subs = [...(task.subtasks || []), { id: uid(), title: "", done: false }]; updateTask(task.id, { subtasks: subs });
                      }} style={{ fontSize: 12, color: "#1a73e8", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, padding: "4px 0" }}>+ Add subtask</button>
                      {(task.subtasks || []).length > 0 && (
                        <div style={{ height: 4, background: "#e8eaed", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${((task.subtasks || []).filter(s => s.done).length / (task.subtasks || []).length) * 100}%`, background: "#34a853", borderRadius: 2 }} />
                        </div>
                      )}
                    </div>
                    {/* Delegation */}
                    <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#80868b", flexShrink: 0 }}>👤 Delegated to:</span>
                      <input value={task.delegatedTo || ""} onChange={e => updateTask(task.id, { delegatedTo: e.target.value })}
                        onKeyDown={e => e.stopPropagation()} placeholder="Name..."
                        style={{ flex: 1, fontSize: 12, border: "1px solid #dadce0", borderRadius: 6, padding: "3px 8px", outline: "none" }} />
                      <span style={{ fontSize: 11, color: "#80868b", flexShrink: 0 }}>Follow-up:</span>
                      <input type="date" value={task.delegatedFollowUp || ""} onChange={e => updateTask(task.id, { delegatedFollowUp: e.target.value })}
                        style={{ fontSize: 12, border: "1px solid #dadce0", borderRadius: 6, padding: "3px 6px", outline: "none", cursor: "pointer" }} />
                    </div>
                    {/* Dependencies */}
                    <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#80868b", flexShrink: 0 }}>🚫 Blocked by:</span>
                      <select value={task.blockedBy || ""} onChange={e => updateTask(task.id, { blockedBy: e.target.value })}
                        style={{ flex: 1, fontSize: 12, border: "1px solid #dadce0", borderRadius: 6, padding: "3px 8px", outline: "none", cursor: "pointer" }}>
                        <option value="">None</option>
                        {tasks.filter(t => t.id !== task.id && t.status !== "completed" && t.status !== "cancelled").map(t => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                      </select>
                      {task.blockedBy && (() => {
                        const blocker = tasks.find(t => t.id === task.blockedBy);
                        return blocker && blocker.status !== "completed" ? (
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#d93025", padding: "2px 8px", background: "#fce8e6", borderRadius: 6 }}>⛔ Blocked</span>
                        ) : blocker?.status === "completed" ? (
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#34a853", padding: "2px 8px", background: "#e6f4ea", borderRadius: 6 }}>✓ Unblocked</span>
                        ) : null;
                      })()}
                    </div>
                    {/* Effort tracking (completed tasks) */}
                    {task.status === "completed" && task.effortMinutes > 0 && (
                      <div style={{ display: "flex", gap: 12, width: "100%", marginTop: 6, alignItems: "center", padding: "6px 10px", background: "#f8f9fa", borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: "#5f6368" }}>📊 Estimated: <b>{fmtDuration(task.duration)}</b></span>
                        <span style={{ fontSize: 12, color: "#5f6368" }}>Actual: <b>{fmtDuration(task.effortMinutes)}</b></span>
                        {task.duration > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: task.effortMinutes > task.duration * 1.2 ? "#d93025" : task.effortMinutes < task.duration * 0.8 ? "#1a73e8" : "#34a853" }}>
                            {Math.round((task.effortMinutes / task.duration) * 100)}% of estimate
                          </span>
                        )}
                      </div>
                    )}
                    {/* Save as template */}
                    <button onClick={() => {
                      const tmpl = { title: task.title, importance: task.importance, duration: task.duration, project: task.project, customer: task.customer, workOrder: task.workOrder, activity: task.activity, tags: task.tags || [], subtasks: (task.subtasks || []).map(s => ({ ...s, done: false })), notes: task.notes || "" };
                      setConfig(prev => ({ ...prev, taskTemplates: [...(prev.taskTemplates || []), tmpl] }));
                      setSaveStatus("Template saved"); setTimeout(() => setSaveStatus(""), 2000);
                    }} style={{ fontSize: 11, color: "#5f6368", background: "transparent", border: "1px solid #dadce0", padding: "4px 10px", borderRadius: 8, cursor: "pointer", marginTop: 6 }}>
                      💾 Save as Template
                    </button>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", width: "100%", marginTop: 6 }}>
                      <button onClick={() => scheduleTask(task)} style={{
                        background: "#fff", border: "1px solid #1a73e8", color: "#1a73e8", padding: "6px 14px",
                        borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600
                      }}>📅 Schedule</button>
                      {timerStatus === "stopped" && (
                        <button onClick={() => startTaskTimer(task)} style={{
                          background: "#34a853", border: "none", color: "#fff", padding: "6px 16px",
                          borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 700
                        }}>▶ Start</button>
                      )}
                      <button onClick={() => completeTask(task.id)} style={{
                        background: "#e6f4ea", border: "1px solid #34a853", color: "#137333", padding: "6px 14px",
                        borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600
                      }}>✓ Done</button>
                      {confirmDeleteId === task.id ? (
                        <>
                          <button onClick={() => { cancelTask(task.id); setConfirmDeleteId(null); setEditingTaskId(null); }} style={{
                            background: "#e37400", border: "none", color: "#fff", padding: "6px 12px",
                            borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600
                          }}>Cancel Task</button>
                          <button onClick={() => { deleteTask(task.id); setConfirmDeleteId(null); setEditingTaskId(null); }} style={{
                            background: "#d93025", border: "none", color: "#fff", padding: "6px 12px",
                            borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600
                          }}>Delete</button>
                          <button onClick={() => setConfirmDeleteId(null)} style={{
                            background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "6px 12px",
                            borderRadius: 12, cursor: "pointer", fontSize: 13
                          }}>Keep</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(task.id)} title="Remove task" style={{
                          background: "#fce8e6", border: "1px solid #d93025", color: "#d93025", padding: "5px 10px",
                          borderRadius: 12, cursor: "pointer", fontSize: 16
                        }}>🗑</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Completed tasks */}
          {completedTasks.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <button onClick={() => setShowCompleted(showCompleted === "completed" ? false : "completed")} style={{
                background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 600, color: "#5f6368", padding: "8px 0"
              }}>
                <span style={{ fontSize: 12, transition: "transform 0.2s", display: "inline-block", transform: showCompleted === "completed" ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                Completed ({completedTasks.length})
              </button>

              {showCompleted === "completed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  {completedTasks.map(task => (
                    <div key={task.id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                      background: "#f8f9fa", border: "1px solid #e8eaed", borderRadius: 10
                    }}>
                      <span style={{ color: "#34a853", fontSize: 16 }}>✓</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, color: "#5f6368", textDecoration: "line-through" }}>{task.title}</div>
                        <div style={{ fontSize: 11, color: "#80868b", marginTop: 2 }}>
                          Completed {task.completedDate}
                          {task.recurring && ` · 🔄 ${task.recurFrequency}`}
                          {task.duration > 0 && ` · ${fmtDuration(task.duration)}`}
                          {task.project && ` · ${task.project}`}
                        </div>
                      </div>
                      <button onClick={() => updateTask(task.id, { status: "not_started", completedDate: "" })} style={{
                        background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 10px",
                        borderRadius: 10, cursor: "pointer", fontSize: 11
                      }}>Reopen</button>
                      <button onClick={() => deleteTask(task.id)} style={{
                        background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 8px",
                        borderRadius: 10, cursor: "pointer", fontSize: 11
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "#d93025"; e.currentTarget.style.color = "#d93025"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "#dadce0"; e.currentTarget.style.color = "#80868b"; }}
                      >🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cancelled tasks */}
          {cancelledTasks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <button onClick={() => setShowCompleted(showCompleted === "cancelled" ? false : "cancelled")} style={{
                background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 600, color: "#80868b", padding: "8px 0"
              }}>
                <span style={{ fontSize: 12, transition: "transform 0.2s", display: "inline-block", transform: showCompleted === "cancelled" ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                Cancelled ({cancelledTasks.length})
              </button>

              {showCompleted === "cancelled" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  {cancelledTasks.map(task => (
                    <div key={task.id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                      background: "#f8f9fa", border: "1px solid #e8eaed", borderRadius: 10
                    }}>
                      <span style={{ color: "#e37400", fontSize: 16 }}>⊘</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, color: "#80868b", textDecoration: "line-through" }}>{task.title}</div>
                        <div style={{ fontSize: 11, color: "#80868b", marginTop: 2 }}>
                          Cancelled {task.completedDate}
                          {task.project && ` · ${task.project}`}
                        </div>
                      </div>
                      <button onClick={() => updateTask(task.id, { status: "not_started", completedDate: "" })} style={{
                        background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 10px",
                        borderRadius: 10, cursor: "pointer", fontSize: 11
                      }}>Reopen</button>
                      <button onClick={() => deleteTask(task.id)} style={{
                        background: "transparent", border: "1px solid #dadce0", color: "#80868b", padding: "3px 8px",
                        borderRadius: 10, cursor: "pointer", fontSize: 11
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "#d93025"; e.currentTarget.style.color = "#d93025"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "#dadce0"; e.currentTarget.style.color = "#80868b"; }}
                      >🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* ═══════ REPORTS TAB ═══════ */}
      {activeTab === "reports" && (
        <div>
          {/* Report period selector */}
          <div style={{ display: "flex", gap: 3, marginBottom: 16 }}>
            {[["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"],["annual","Annual"],["batch","Batch"],["comparison","Compare"]].map(([k, l]) => (
              <button key={k} onClick={() => setReportView(k)} style={{
                fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, padding: "9px 20px",
                background: reportView === k ? "#1a73e8" : "#ffffff",
                color: reportView === k ? "#f1f3f4" : "#5f6368",
                border: `1px solid ${reportView === k ? "#1a73e8" : "#dadce0"}`,
                borderRadius: 20, cursor: "pointer"
              }}>{l}</button>
            ))}
          </div>

          {/* Group-by filter */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 24,
            padding: "12px 16px", background: "#ffffff", borderRadius: 8, border: "1px solid #dadce0", flexWrap: "wrap"
          }}>
            <span style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px" }}>Group by</span>
            <div style={{ display: "flex", gap: 3 }}>
              {[["none","None"],["activity","Activity"],["role","Role"],["billRate","Bill Rate"],["workOrder","Work Order"],["project","Project"],["customer","Customer"],["tag","Tags"]].map(([k, l]) => (
                <button key={k} onClick={() => setReportGroup(k)} style={{
                  fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, padding: "7px 14px",
                  background: reportGroup === k ? "#1a73e8" : "#ffffff",
                  color: reportGroup === k ? "#fff" : "#5f6368",
                  border: `1px solid ${reportGroup === k ? "#1a73e8" : "#dadce0"}`,
                  borderRadius: 4, cursor: "pointer"
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 24,
            padding: "12px 16px", background: "#ffffff", borderRadius: 8, border: "1px solid #dadce0", flexWrap: "wrap"
          }}>
            <span style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px" }}>Filter by</span>
            <div style={{ display: "flex", gap: 3 }}>
              {[["none","None"],["activity","Activity"],["role","Role"],["billRate","Bill Rate"],["workOrder","Work Order"],["project","Project"],["customer","Customer"],["tag","Tag"]].map(([k, l]) => (
                <button key={k} onClick={() => { setReportFilterField(k); setReportFilterValues([]); }} style={{
                  fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, padding: "7px 14px",
                  background: reportFilterField === k ? "#e37400" : "#ffffff",
                  color: reportFilterField === k ? "#fff" : "#5f6368",
                  border: `1px solid ${reportFilterField === k ? "#e37400" : "#dadce0"}`,
                  borderRadius: 4, cursor: "pointer"
                }}>{l}</button>
              ))}
            </div>
            {reportFilterField !== "none" && (() => {
              const allVals = getFilterValues(reportFilterField);
              const available = allVals.filter(v => !reportFilterValues.includes(v));
              return (
                <>
                  {reportFilterValues.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {reportFilterValues.map(v => (
                        <span key={v} style={{
                          display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px",
                          background: "#fff3e0", color: "#e37400", borderRadius: 16, fontSize: 13, fontWeight: 500
                        }}>
                          {v}
                          <span onClick={() => setReportFilterValues(prev => prev.filter(x => x !== v))}
                            style={{ cursor: "pointer", fontWeight: 700, fontSize: 12, color: "#bf5f00" }}
                            onMouseEnter={e => e.target.style.color = "#d93025"}
                            onMouseLeave={e => e.target.style.color = "#bf5f00"}
                          >×</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {available.length > 0 && (
                    <select value="" onChange={e => { if (e.target.value) setReportFilterValues(prev => [...prev, e.target.value]); }} style={{
                      background: "#ffffff", border: "1px solid #dadce0", color: "#80868b",
                      padding: "7px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif",
                      fontSize: 14, outline: "none", cursor: "pointer", minWidth: 140
                    }}>
                      <option value="">+ Add filter value</option>
                      {available.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                  {reportFilterValues.length > 0 && (
                    <button onClick={() => { setReportFilterField("none"); setReportFilterValues([]); }} style={{
                      background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "7px 12px",
                      borderRadius: 4, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13
                    }}>Clear</button>
                  )}
                </>
              );
            })()}
          </div>

          {/* Period navigation — shared across all views */}
          {reportView === "daily" && (() => {
            const dayName = DAYS[(reportDate.getDay() + 6) % 7];
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <button onClick={() => navReportDate(-1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>←</button>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{dayName}</div>
                  <div style={{ fontSize: 14, color: "#5f6368", marginTop: 3 }}>{reportDate.getDate()} {MONTHS[reportDate.getMonth()]} {reportDate.getFullYear()}</div>
                </div>
                <button onClick={() => navReportDate(1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>→</button>
              </div>
            );
          })()}
          {reportView === "weekly" && (() => {
            const { days } = weeklyReportData;
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <button onClick={() => navReportWeek(-1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>←</button>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Inter', 'Roboto', sans-serif" }}>Week {reportWeek}</div>
                  <div style={{ fontSize: 14, color: "#5f6368", marginTop: 3 }}>{formatDate(days[0].date)} — {formatDate(days[6].date)} {reportWeekYear}</div>
                </div>
                <button onClick={() => navReportWeek(1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>→</button>
              </div>
            );
          })()}
          {reportView === "monthly" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <button onClick={() => navReportMonth(-1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>←</button>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{MONTHS[reportMonth]} {reportYear}</div>
              <button onClick={() => navReportMonth(1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>→</button>
            </div>
          )}
          {reportView === "annual" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <button onClick={() => setReportAnnualYear(y => y - 1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>←</button>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{reportAnnualYear}</div>
              <button onClick={() => setReportAnnualYear(y => y + 1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>→</button>
            </div>
          )}
          {reportView === "batch" && (() => {
            const wd = batchReportData.weekDates;
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <button onClick={() => navReportWeek(-1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>←</button>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Inter', 'Roboto', sans-serif" }}>Week {reportWeek}</div>
                  <div style={{ fontSize: 14, color: "#5f6368", marginTop: 3 }}>{formatDate(wd[0])} — {formatDate(wd[6])} {reportWeekYear}</div>
                </div>
                <button onClick={() => navReportWeek(1)} style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 16px", borderRadius: 20, cursor: "pointer", fontSize: 16 }}>→</button>
              </div>
            );
          })()}

          {/* ════════════════════════════════════════ */}
          {/* TIME QUALITY SUMMARY */}
          {/* ════════════════════════════════════════ */}
          {timeQuality && timeQuality.total > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 16, padding: "12px 18px", marginBottom: 18,
              background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 10
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>Time Quality</div>
              <div style={{ flex: 1, height: 12, borderRadius: 6, overflow: "hidden", display: "flex", background: "#e8eaed" }}>
                {timeQuality.good > 0 && <div style={{ width: `${(timeQuality.good / timeQuality.total) * 100}%`, background: "#34a853", height: "100%" }} />}
                {timeQuality.neutral > 0 && <div style={{ width: `${(timeQuality.neutral / timeQuality.total) * 100}%`, background: "#dadce0", height: "100%" }} />}
                {timeQuality.bad > 0 && <div style={{ width: `${(timeQuality.bad / timeQuality.total) * 100}%`, background: "#d93025", height: "100%" }} />}
              </div>
              <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                {timeQuality.good > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34a853" }} />
                    <span style={{ fontSize: 13, color: "#137333", fontWeight: 600 }}>{fmtH(timeQuality.good)}</span>
                    <span style={{ fontSize: 11, color: "#5f6368" }}>good</span>
                  </div>
                )}
                {timeQuality.bad > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d93025" }} />
                    <span style={{ fontSize: 13, color: "#c5221f", fontWeight: 600 }}>{fmtH(timeQuality.bad)}</span>
                    <span style={{ fontSize: 11, color: "#5f6368" }}>bad</span>
                  </div>
                )}
                {timeQuality.neutral > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#dadce0" }} />
                    <span style={{ fontSize: 13, color: "#5f6368", fontWeight: 600 }}>{fmtH(timeQuality.neutral)}</span>
                    <span style={{ fontSize: 11, color: "#80868b" }}>uncat.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════ */}
          {/* GROUPED VIEW — when a group-by is active */}
          {/* ════════════════════════════════════════ */}
          {reportGroup !== "none" && (() => {
            const data = groupedReportData || [];
            const total = data.reduce((s, [, h]) => s + h, 0);
            const maxVal = data.length > 0 ? data[0][1] : 1;
            const groupLabel = { customer: "Customer", project: "Project", workOrder: "Work Order", activity: "Activity", role: "Role", billRate: "Bill Rate", tag: "Tag" }[reportGroup];
            const subLabel = { customer: "Project", project: "Activity", workOrder: "Activity", activity: "Project", role: "Project", billRate: "Project", tag: "Project" }[reportGroup];
            const periodLabel = reportView === "daily"
              ? `${DAYS[(reportDate.getDay()+6)%7]} ${reportDate.getDate()} ${MONTHS[reportDate.getMonth()].slice(0,3)}`
              : (reportView === "weekly" || reportView === "batch") ? `Week ${reportWeek}, ${reportWeekYear}`
              : reportView === "monthly" ? `${MONTHS[reportMonth]} ${reportYear}`
              : `${reportAnnualYear}`;

            return (
              <div>
                {data.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 60, color: "#80868b", fontSize: 15 }}>
                    No entries found for this period
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                    {data.map(([name, hrs, subs], i) => {
                      const displayName = (reportGroup === "customer") ? resolveLabel(name, activeConfig.customers)
                        : (reportGroup === "project") ? resolveLabel(name, activeConfig.projects)
                        : (reportGroup === "workOrder") ? resolveLabel(name, activeConfig.workOrders)
                        : name;
                      return (
                      <div key={name} style={{
                        background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.06)", overflow: "hidden"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                          <div style={{ width: 5, height: 40, borderRadius: 3, background: BLOCK_COLORS[i % BLOCK_COLORS.length], flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: "#202124", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
                            <div style={{ fontSize: 13, color: "#5f6368", marginTop: 3 }}>
                              {total > 0 ? Math.round((hrs / total) * 100) : 0}% of total
                            </div>
                          </div>
                          <div style={{ width: 120, height: 8, background: "#dadce0", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                            <div style={{ height: "100%", width: `${(hrs / maxVal) * 100}%`, background: BLOCK_COLORS[i % BLOCK_COLORS.length], borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#1a73e8", flexShrink: 0, width: 80, textAlign: "right" }}>
                            {fmtH(hrs)}
                          </div>
                        </div>
                        {/* Sub-group breakdown */}
                        {subs && subs.length > 0 && (
                          <div style={{ padding: "0 18px 12px 36px", display: "flex", flexDirection: "column", gap: 4 }}>
                            {subs.map(([subName, subHrs], si) => {
                              const subDisplayName = (reportGroup === "customer" || reportGroup === "activity" || reportGroup === "role" || reportGroup === "billRate" || reportGroup === "tag")
                                ? resolveLabel(subName, activeConfig.projects)
                                : subName;
                              return (
                                <div key={subName} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", background: "#f8f9fa", borderRadius: 8 }}>
                                  <div style={{ flex: 1, fontSize: 13, color: "#3c4043", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {subDisplayName}
                                  </div>
                                  <div style={{ width: 80, height: 5, background: "#e8eaed", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                                    <div style={{ height: "100%", width: `${hrs > 0 ? (subHrs / hrs) * 100 : 0}%`, background: BLOCK_COLORS[i % BLOCK_COLORS.length], borderRadius: 3, opacity: 0.6 }} />
                                  </div>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: "#5f6368", flexShrink: 0, width: 60, textAlign: "right" }}>
                                    {fmtH(subHrs)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Total */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px",
                  background: "#ffffff", border: "1px solid #1a73e8", borderRadius: 10
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px" }}>
                      Total by {groupLabel}
                    </div>
                    <div style={{ fontSize: 12, color: "#80868b", marginTop: 3 }}>{periodLabel} · {data.length} {groupLabel.toLowerCase()}{data.length !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#1a73e8" }}>{fmtH(total)}</div>
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════ */}
          {/* TIME-BASED VIEWS — when group-by is "none" */}
          {/* ══════════════════════════════════════════ */}
          {reportGroup === "none" && (
            <>
              {/* ── DAILY ── */}
              {reportView === "daily" && (() => {
                const entries = getFilteredEntriesForDate(reportDate);
                const total = sumEntryHours(entries);
                return (
                  <div>
                    {entries.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 60, color: "#80868b", fontSize: 15 }}>No entries for this day</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                        {entries.map((ent, i) => {
                          const s = parseTime(ent.start), e = parseTime(ent.end);
                          const hrs = s !== null && e !== null ? Math.max(0, e - s) : 0;
                          const entryTags = ent.tags && ent.tags.length > 0 ? ent.tags : (ent.tag ? [ent.tag] : []);
                          const tags = [
                            ent.activity,
                            ent.role,
                            ent.billRate,
                            resolveLabel(ent.workOrder, activeConfig.workOrders),
                            resolveLabel(ent.project, activeConfig.projects),
                            resolveLabel(ent.customer, activeConfig.customers),
                            ...entryTags
                          ].filter(Boolean);
                          return (
                            <div key={ent.id || i} style={{
                              display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                              background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.06)"
                            }}>
                              <div style={{ width: 4, height: 40, borderRadius: 2, background: BLOCK_COLORS[i % BLOCK_COLORS.length] }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 15, color: "#202124", fontWeight: 600 }}>{ent.start} — {ent.end}</div>
                                {tags.length > 0 && <div style={{ fontSize: 13, color: "#5f6368", marginTop: 3 }}>{tags.join(" · ")}</div>}
                                {ent.note && <div style={{ fontSize: 13, color: "#80868b", marginTop: 3, fontStyle: "italic" }}>{ent.note}</div>}
                              </div>
                              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#1a73e8" }}>{fmtH(hrs)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", background: "#ffffff", border: "1px solid #1a73e8", borderRadius: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px" }}>Day Total</div>
                      <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#1a73e8" }}>{fmtH(total)}</div>
                    </div>
                  </div>
                );
              })()}

              {/* ── WEEKLY ── */}
              {reportView === "weekly" && (() => {
                const { days, total, overtime } = weeklyReportData;
                return (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                      {days.map((d, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                          background: d.date.toDateString() === now.toDateString() ? "#e8f0fe" : "#ffffff",
                          border: `1px solid ${d.date.toDateString() === now.toDateString() ? "#1a73e8" : "#dadce0"}`, borderRadius: 8
                        }}>
                          <div style={{ width: 70 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: d.date.toDateString() === now.toDateString() ? "#1a73e8" : (i >= 5 ? "#80868b" : "#202124") }}>{d.label}</div>
                            <div style={{ fontSize: 13, color: "#5f6368" }}>{formatDate(d.date)}</div>
                          </div>
                          <div style={{ flex: 1, height: 8, background: "#dadce0", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${total > 0 ? (d.hours / total) * 100 : 0}%`, background: d.hours > 0 ? "#1a73e8" : "transparent", borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: d.hours > 0 ? "#202124" : "#dadce0", width: 70, textAlign: "right" }}>
                            {d.hours > 0 ? fmtH(d.hours) : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="wht-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Total</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{fmtH(total)}</div>
                      </div>
                      <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Contracted</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#5f6368" }}>{fmtH(stdHrs)}</div>
                      </div>
                      <div style={{ background: overtime > 0 ? "#e8f0fe" : "#ffffff", border: `1px solid ${overtime > 0 ? "#1a73e8" : "#dadce0"}`, borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Overtime</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: overtime > 0 ? "#1a73e8" : "#5f6368" }}>{total > 0 ? fmtH(overtime) : "—"}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── MONTHLY ── */}
              {reportView === "monthly" && (() => {
                const { weeks, totalHours, contracted, overtime } = monthlyReportData;
                return (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                      {weeks.map((w, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                          background: "#ffffff", border: "1px solid #e8eaed", borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.06)"
                        }}>
                          <div style={{ width: 80 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#202124" }}>Week {w.weekNum}</div>
                            <div style={{ fontSize: 13, color: "#5f6368" }}>{formatDate(w.startDate)}</div>
                          </div>
                          <div style={{ flex: 1, height: 8, background: "#dadce0", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${contracted > 0 ? Math.min(100, (w.hours / contracted) * 100 * weeks.length) : 0}%`, background: w.hours > 0 ? "#1a73e8" : "transparent", borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: w.hours > 0 ? "#202124" : "#dadce0", width: 80, textAlign: "right" }}>
                            {w.hours > 0 ? fmtH(w.hours) : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="wht-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Total</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{fmtH(totalHours)}</div>
                      </div>
                      <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Contracted</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#5f6368" }}>{fmtH(contracted)}</div>
                      </div>
                      <div style={{ background: overtime > 0 ? "#e8f0fe" : "#ffffff", border: `1px solid ${overtime > 0 ? "#1a73e8" : "#dadce0"}`, borderRadius: 12, padding: "16px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Overtime</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: overtime > 0 ? "#1a73e8" : "#5f6368" }}>{totalHours > 0 ? fmtH(overtime) : "—"}</div>
                      </div>
                    </div>
                    <div style={{ padding: "16px 20px", background: "#ffffff", border: "1px solid #dadce0", borderRadius: 10, marginTop: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#5f6368", marginBottom: 10 }}>
                        <span>Progress</span>
                        <span>{contracted > 0 ? Math.round((totalHours / contracted) * 100) : 0}%</span>
                      </div>
                      <div style={{ height: 10, background: "#dadce0", borderRadius: 5, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 5,
                          width: `${Math.min(100, contracted > 0 ? (totalHours / contracted) * 100 : 0)}%`,
                          background: overtime > 0 ? "linear-gradient(90deg, #1a73e8, #d93025)" : "linear-gradient(90deg, #1a73e8, #4285f4)",
                          transition: "width 0.5s ease"
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── ANNUAL ── */}
              {reportView === "annual" && (() => {
                const { months, totalHours, contracted, overtime } = annualReportData;
                const maxMonth = Math.max(...months.map(m => m.hours), 1);
                return (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                      {months.map((m, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 14, padding: "12px 18px",
                          background: i === now.getMonth() && reportAnnualYear === now.getFullYear() ? "#e8f0fe" : "#ffffff",
                          border: `1px solid ${i === now.getMonth() && reportAnnualYear === now.getFullYear() ? "#1a73e8" : "#dadce0"}`,
                          borderRadius: 8
                        }}>
                          <div style={{ width: 90, fontSize: 15, fontWeight: 600, color: i === now.getMonth() && reportAnnualYear === now.getFullYear() ? "#1a73e8" : "#3c4043" }}>
                            {m.month.slice(0, 3)}
                          </div>
                          <div style={{ flex: 1, height: 8, background: "#dadce0", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(m.hours / maxMonth) * 100}%`, background: m.hours > 0 ? "#1a73e8" : "transparent", borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: m.hours > 0 ? "#202124" : "#dadce0", width: 80, textAlign: "right" }}>
                            {m.hours > 0 ? fmtH(m.hours) : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="wht-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "18px 22px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Year Total</div>
                        <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif" }}>{fmtH(totalHours)}</div>
                      </div>
                      <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, padding: "18px 22px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Contracted</div>
                        <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: "#5f6368" }}>{fmtH(contracted)}</div>
                      </div>
                      <div style={{ background: overtime > 0 ? "#e8f0fe" : "#ffffff", border: `1px solid ${overtime > 0 ? "#1a73e8" : "#dadce0"}`, borderRadius: 12, padding: "18px 22px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                        <div style={{ fontSize: 13, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Overtime</div>
                        <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "'Inter', 'Roboto', sans-serif", color: overtime > 0 ? "#1a73e8" : "#5f6368" }}>{totalHours > 0 ? fmtH(overtime) : "—"}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Batch timesheet grid */}
              {reportView === "batch" && (() => {
                const { rows, grandTotal, grandTotalSum, weekDates } = batchReportData;
                return (
                  <div style={{ background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Inter', 'Roboto', sans-serif", tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "auto", minWidth: 240 }} />
                        {SHORT_DAYS.map(d => <col key={d} style={{ width: 70 }} />)}
                        <col style={{ width: 80 }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", borderBottom: "2px solid #dadce0" }}>Project / Work Order / Activity</th>
                          {SHORT_DAYS.map((d, i) => (
                            <th key={d} style={{ textAlign: "right", padding: "10px 8px", fontSize: 12, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", borderBottom: "2px solid #dadce0" }}>
                              <div>{d}</div>
                              <div style={{ fontSize: 10, fontWeight: 400, color: "#80868b" }}>{weekDates[i].getDate()}</div>
                            </th>
                          ))}
                          <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", borderBottom: "2px solid #dadce0" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 && (
                          <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "#80868b", fontStyle: "italic" }}>No entries for this week</td></tr>
                        )}
                        {rows.flatMap((proj, pi) => [
                          /* Project header row */
                          <tr key={`p${pi}`} style={{ background: "#eef2f7" }}>
                            <td style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700, color: "#202124", fontSize: 14, borderBottom: "1px solid #dadce0" }}>
                              {proj.project}
                            </td>
                            {proj.projectTotal.map((h, di) => (
                              <td key={di} style={{ textAlign: "right", padding: "10px 8px", fontWeight: 700, color: h > 0 ? "#202124" : "#dadce0", fontSize: 14, borderBottom: "1px solid #dadce0" }}>
                                {h > 0 ? fmtH(h) : "—"}
                              </td>
                            ))}
                            <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700, color: "#1a73e8", fontSize: 15, borderBottom: "1px solid #dadce0" }}>
                              {fmtH(proj.total)}
                            </td>
                          </tr>,
                          /* Work order rows with nested activities */
                          ...proj.workOrders.flatMap((wo, wi) => [
                            <tr key={`p${pi}w${wi}`} style={{ background: "#f8f9fa" }}>
                              <td style={{ textAlign: "left", padding: "8px 12px 8px 24px", fontWeight: 600, color: "#3c4043", fontSize: 13, borderBottom: "1px solid #e8eaed" }}>
                                {wo.name}
                              </td>
                              {wo.days.map((h, di) => (
                                <td key={di} style={{ textAlign: "right", padding: "8px 8px", fontWeight: 600, color: h > 0 ? "#3c4043" : "#dadce0", fontSize: 13, borderBottom: "1px solid #e8eaed" }}>
                                  {h > 0 ? fmtH(h) : "—"}
                                </td>
                              ))}
                              <td style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "#3c4043", fontSize: 13, borderBottom: "1px solid #e8eaed" }}>
                                {fmtH(wo.total)}
                              </td>
                            </tr>,
                            /* Activity rows */
                            ...wo.activities.map((act, ai) => (
                              <tr key={`p${pi}w${wi}a${ai}`}>
                                <td style={{ textAlign: "left", padding: "6px 12px 6px 44px", color: "#5f6368", fontSize: 12, borderBottom: "1px solid #f1f3f4", fontStyle: "italic" }}>
                                  {act.name}
                                </td>
                                {act.days.map((h, di) => (
                                  <td key={di} style={{ textAlign: "right", padding: "6px 8px", color: h > 0 ? "#5f6368" : "#e8eaed", fontSize: 12, borderBottom: "1px solid #f1f3f4" }}>
                                    {h > 0 ? fmtH(h) : "—"}
                                  </td>
                                ))}
                                <td style={{ textAlign: "right", padding: "6px 12px", color: "#5f6368", fontSize: 12, fontWeight: 500, borderBottom: "1px solid #f1f3f4" }}>
                                  {fmtH(act.total)}
                                </td>
                              </tr>
                            ))
                          ])
                        ])}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#e8f0fe" }}>
                          <td style={{ textAlign: "left", padding: "12px 12px", fontWeight: 700, color: "#1a73e8", borderTop: "2px solid #1a73e8" }}>
                            Total
                          </td>
                          {grandTotal.map((h, di) => (
                            <td key={di} style={{ textAlign: "right", padding: "12px 8px", fontWeight: 700, color: h > 0 ? "#1a73e8" : "#a8c7fa", borderTop: "2px solid #1a73e8" }}>
                              {h > 0 ? fmtH(h) : "—"}
                            </td>
                          ))}
                          <td style={{ textAlign: "right", padding: "12px 12px", fontWeight: 700, color: "#1a73e8", fontSize: 16, borderTop: "2px solid #1a73e8" }}>
                            {fmtH(grandTotalSum)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}
            </>
          )}

          {/* ═══ COMPARISON REPORT ═══ */}
          {reportView === "comparison" && (() => {
            const isWeekly = reportGroupBy === "weekly" || !reportGroupBy || reportGroupBy === "project" || reportGroupBy === "activity";

            function getWeekHours(weekNum, year) {
              const key = `${year}-W${weekNum}`;
              const wd = allData[key] || [];
              const byProject = {};
              let total = 0;
              for (let i = 0; i < 7; i++) {
                (wd[i] || []).forEach(e => {
                  const s = parseTime(e.start), en = parseTime(e.end);
                  if (s !== null && en !== null) {
                    const hrs = en - s; total += hrs;
                    const p = e.project || "(No project)";
                    byProject[p] = (byProject[p] || 0) + hrs;
                  }
                });
              }
              return { total, byProject, label: `W${weekNum}` };
            }

            function getMonthHours(month, year) {
              const start = new Date(year, month, 1), end = new Date(year, month + 1, 0);
              const byProject = {}; let total = 0;
              const d = new Date(start);
              while (d <= end) {
                const entries = getEntriesForDate(new Date(d));
                entries.forEach(e => {
                  const s = parseTime(e.start), en = parseTime(e.end);
                  if (s !== null && en !== null) {
                    const hrs = en - s; total += hrs;
                    const p = e.project || "(No project)";
                    byProject[p] = (byProject[p] || 0) + hrs;
                  }
                });
                d.setDate(d.getDate() + 1);
              }
              return { total, byProject, label: MONTHS[month].substring(0, 3) };
            }

            const periods = [];
            if (isWeekly) {
              for (let i = 5; i >= 0; i--) {
                let w = reportWeek - i, y = reportWeekYear;
                while (w < 1) { y--; w += 52; }
                periods.push(getWeekHours(w, y));
              }
            } else {
              for (let i = 5; i >= 0; i--) {
                let m = reportMonth - i, y = reportYear;
                while (m < 0) { y--; m += 12; }
                periods.push(getMonthHours(m, y));
              }
            }

            const allProjects = [...new Set(periods.flatMap(p => Object.keys(p.byProject)))].sort();
            const maxHrs = Math.max(...periods.map(p => p.total), 1);
            const clrs = ["#1a73e8","#34a853","#e37400","#d93025","#8b5cf6","#24c1e0","#ea4335","#fbbc04","#0d904f","#c5221f"];

            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#202124" }}>📊 Time Distribution Comparison</div>
                  <div style={{ display: "flex", gap: 3, background: "#f1f3f4", borderRadius: 8, padding: 2 }}>
                    {[["weekly","Week-over-Week"],["monthly","Month-over-Month"]].map(([k,l]) => (
                      <button key={k} onClick={() => setReportGroupBy(k === "weekly" ? "weekly" : "monthly")} style={{
                        fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 6, cursor: "pointer",
                        background: (isWeekly && k === "weekly") || (!isWeekly && k === "monthly") ? "#fff" : "transparent",
                        color: (isWeekly && k === "weekly") || (!isWeekly && k === "monthly") ? "#1a73e8" : "#5f6368",
                        border: "none", boxShadow: (isWeekly && k === "weekly") || (!isWeekly && k === "monthly") ? "0 1px 3px rgba(0,0,0,0.12)" : "none"
                      }}>{l}</button>
                    ))}
                  </div>
                </div>

                <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "20px", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 200, marginBottom: 12 }}>
                    {periods.map((p, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                        <div style={{ height: `${(p.total / maxHrs) * 100}%`, minHeight: p.total > 0 ? 4 : 0, display: "flex", flexDirection: "column-reverse", borderRadius: "4px 4px 0 0", overflow: "hidden" }}>
                          {allProjects.map((proj, pi) => {
                            const hrs = p.byProject[proj] || 0;
                            if (hrs === 0) return null;
                            return <div key={proj} style={{ height: `${(hrs / p.total) * 100}%`, background: clrs[pi % clrs.length], minHeight: 2 }} title={`${proj}: ${fmtH(hrs)}`} />;
                          })}
                        </div>
                        <div style={{ textAlign: "center", marginTop: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#202124" }}>{fmtH(p.total)}</div>
                          <div style={{ fontSize: 11, color: "#80868b" }}>{p.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", borderTop: "1px solid #e8eaed", paddingTop: 12 }}>
                    {allProjects.map((proj, pi) => (
                      <div key={proj} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#3c4043" }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: clrs[pi % clrs.length] }} />{proj}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "16px 20px", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: "2px solid #e8eaed" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#5f6368", fontWeight: 600 }}>Project</th>
                      {periods.map((p, i) => <th key={i} style={{ textAlign: "right", padding: "8px 12px", color: "#5f6368", fontWeight: 600 }}>{p.label}</th>)}
                      <th style={{ textAlign: "right", padding: "8px 12px", color: "#5f6368", fontWeight: 600 }}>Trend</th>
                    </tr></thead>
                    <tbody>
                      {allProjects.map(proj => {
                        const vals = periods.map(p => p.byProject[proj] || 0);
                        const first = vals.find(v => v > 0) || 0;
                        const last = vals[vals.length - 1];
                        const trend = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
                        return (
                          <tr key={proj} style={{ borderBottom: "1px solid #f1f3f4" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 500 }}>{proj}</td>
                            {vals.map((v, i) => <td key={i} style={{ textAlign: "right", padding: "8px 12px", color: v > 0 ? "#202124" : "#dadce0" }}>{v > 0 ? fmtH(v) : "—"}</td>)}
                            <td style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: trend > 0 ? "#d93025" : trend < 0 ? "#34a853" : "#80868b" }}>
                              {trend > 0 ? `↑${trend}%` : trend < 0 ? `↓${Math.abs(trend)}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: "2px solid #e8eaed", fontWeight: 700 }}>
                        <td style={{ padding: "8px 12px" }}>Total</td>
                        {periods.map((p, i) => <td key={i} style={{ textAlign: "right", padding: "8px 12px", color: "#1a73e8" }}>{fmtH(p.total)}</td>)}
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════ PORTFOLIO TAB ═══════ */}
      {activeTab === "portfolio" && isPortfolioManager && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={activePortfolioId || ""} onChange={e => { setActivePortfolioId(e.target.value || null); setPortfolioWeekKey(null); }}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #dadce0", fontSize: 14, fontFamily: "'Inter', 'Roboto', sans-serif" }}>
              <option value="">Select portfolio...</option>
              {myPortfolioMemberships.filter(m => m.role === 'manager').map(m => (
                <option key={m.portfolio_id} value={m.portfolio_id}>{m.portfolios?.name || m.portfolio_id}</option>
              ))}
            </select>
            {activePortfolioId && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setPortfolioWeekKey(prev => {
                  const [y, w] = (prev || weekKey).split("-W").map(Number);
                  return w > 1 ? `${y}-W${w - 1}` : `${y - 1}-W52`;
                })} style={{ padding: "6px 10px", background: "#f1f3f4", border: "none", borderRadius: 6, cursor: "pointer" }}>◀</button>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#202124", minWidth: 80, textAlign: "center" }}>{portfolioWeekKey || weekKey}</span>
                <button onClick={() => setPortfolioWeekKey(prev => {
                  const [y, w] = (prev || weekKey).split("-W").map(Number);
                  return w < 52 ? `${y}-W${w + 1}` : `${y + 1}-W1`;
                })} style={{ padding: "6px 10px", background: "#f1f3f4", border: "none", borderRadius: 6, cursor: "pointer" }}>▶</button>
              </div>
            )}
          </div>

          {!activePortfolioId && (
            <div style={{ textAlign: "center", padding: 40, color: "#5f6368", fontSize: 14 }}>Select a portfolio to view member hours and tasks.</div>
          )}

          {activePortfolioId && portfolioLoading && (
            <div style={{ textAlign: "center", padding: 40, color: "#5f6368" }}>Loading portfolio data...</div>
          )}

          {activePortfolioId && !portfolioLoading && (() => {
            const members = portfolioMemberMap[activePortfolioId] || [];
            const memberIds = members.map(m => m.user_id);
            const memberLookup = {};
            for (const m of members) {
              const om = orgMembers.find(x => x.user_id === m.user_id);
              memberLookup[m.user_id] = om?.display_name || m.user_id.slice(0, 8);
            }

            const entriesByUser = {};
            for (const e of portfolioEntries) {
              if (!entriesByUser[e.user_id]) entriesByUser[e.user_id] = [];
              entriesByUser[e.user_id].push(e);
            }

            const tasksByUser = {};
            for (const t of portfolioTasks) {
              if (!tasksByUser[t.user_id]) tasksByUser[t.user_id] = [];
              tasksByUser[t.user_id].push(t);
            }

            return (
              <div>
                {/* Hours summary */}
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 1, background: "#c5d7f2" }} />
                  Hours — {portfolioWeekKey || weekKey}
                  <div style={{ flex: 1, height: 1, background: "#c5d7f2" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {memberIds.map(uid => {
                    const userEntries = entriesByUser[uid] || [];
                    let totalMins = 0;
                    for (const e of userEntries) {
                      if (e.start_time && e.end_time) {
                        const [sh, sm] = e.start_time.split(":").map(Number);
                        const [eh, em] = e.end_time.split(":").map(Number);
                        totalMins += (eh * 60 + em) - (sh * 60 + sm);
                      }
                    }
                    const hrs = (totalMins / 60).toFixed(1);
                    return (
                      <div key={uid} style={{ background: "#fff", border: "1px solid #dadce0", borderRadius: 8, padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "#202124" }}>{memberLookup[uid]}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8" }}>{hrs}h</span>
                        </div>
                        {userEntries.length > 0 && (
                          <div style={{ fontSize: 12, color: "#5f6368" }}>
                            {userEntries.length} entries across {new Set(userEntries.map(e => e.day_index)).size} days
                            {userEntries.some(e => e.project) && (
                              <> — {[...new Set(userEntries.filter(e => e.project).map(e => e.project))].join(", ")}</>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Tasks overview */}
                <div style={{ fontSize: 12, fontWeight: 700, color: "#137333", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 1, background: "#c5e6d0" }} />
                  Tasks
                  <div style={{ flex: 1, height: 1, background: "#c5e6d0" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {memberIds.map(uid => {
                    const userTasks = tasksByUser[uid] || [];
                    const active = userTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
                    const completed = userTasks.filter(t => t.status === 'completed');
                    return (
                      <div key={uid} style={{ background: "#fff", border: "1px solid #dadce0", borderRadius: 8, padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#202124", marginBottom: 6 }}>{memberLookup[uid]}</div>
                        <div style={{ fontSize: 12, color: "#5f6368", marginBottom: 6 }}>
                          {active.length} active, {completed.length} completed
                        </div>
                        {active.slice(0, 5).map(t => (
                          <div key={t.id} style={{ fontSize: 13, color: "#202124", padding: "3px 0", borderTop: "1px solid #f1f3f4" }}>
                            <span style={{ fontWeight: 500 }}>{t.title}</span>
                            {t.status && t.status !== 'not_started' && (
                              <span style={{ fontSize: 11, marginLeft: 6, color: "#5f6368" }}>({t.status.replace("_", " ")})</span>
                            )}
                            {t.project && <span style={{ fontSize: 11, marginLeft: 6, color: "#1a73e8" }}>{t.project}</span>}
                          </div>
                        ))}
                        {active.length > 5 && <div style={{ fontSize: 12, color: "#80868b", marginTop: 4 }}>+{active.length - 5} more</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════ ADMIN TAB ═══════ */}
      {activeTab === "admin" && (() => {
        const cfgUpdate = (key) => (val) => {
          if (isOrgProfile && isOrgAdmin) setOrgConfig(prev => ({ ...(prev || {}), [key]: val }));
          else setConfig(prev => ({ ...prev, [key]: val }));
        };
        return (
        <div>
          {/* ── ORGANIZATION ── */}
          {supabaseConfigured && userId !== "local" && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: "#c4b5fd" }} />
                Organization
                <div style={{ flex: 1, height: 1, background: "#c4b5fd" }} />
              </div>
              <div style={{ background: "#fff", border: "1px solid #dadce0", borderRadius: 12, padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                {org ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#202124" }}>{org.organizations?.name || "Organization"}</div>
                        <div style={{ fontSize: 13, color: "#5f6368" }}>Your role: <strong>{org.role}</strong></div>
                      </div>
                      <button onClick={handleLeaveOrg} style={{ fontSize: 12, padding: "6px 14px", background: "#fce8e6", color: "#d93025", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>Leave</button>
                    </div>
                    {isOrgAdmin && (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 14px", background: "#f3e8ff", borderRadius: 8 }}>
                          <span style={{ fontSize: 13, color: "#5f6368" }}>Invite code:</span>
                          <code style={{ fontSize: 14, fontWeight: 600, color: "#7c3aed", background: "#ede9fe", padding: "2px 8px", borderRadius: 4 }}>{org.organizations?.invite_code}</code>
                          <button onClick={() => { navigator.clipboard?.writeText(org.organizations?.invite_code || ""); }} style={{ fontSize: 11, padding: "4px 10px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Copy</button>
                          <button onClick={handleRegenerateInvite} style={{ fontSize: 11, padding: "4px 10px", background: "#fff", color: "#7c3aed", border: "1px solid #c4b5fd", borderRadius: 4, cursor: "pointer" }}>Regenerate</button>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#202124", marginBottom: 8 }}>Members ({orgMembers.length})</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                          {orgMembers.map(m => (
                            <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fafafa", borderRadius: 6, fontSize: 13 }}>
                              <span style={{ flex: 1, color: "#202124" }}>{m.display_name || m.user_id.slice(0, 8)}</span>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: m.role === 'admin' ? "#ede9fe" : "#f1f3f4", color: m.role === 'admin' ? "#7c3aed" : "#5f6368", fontWeight: 600 }}>{m.role}</span>
                              {m.user_id !== userId && (
                                <>
                                  <button onClick={() => handleToggleAdmin(m.user_id)} style={{ fontSize: 11, padding: "3px 8px", background: "#fff", border: "1px solid #dadce0", borderRadius: 4, cursor: "pointer" }}>{m.role === 'admin' ? 'Demote' : 'Make Admin'}</button>
                                  <button onClick={() => handleRemoveMember(m.user_id)} style={{ fontSize: 11, padding: "3px 8px", background: "#fce8e6", color: "#d93025", border: "none", borderRadius: 4, cursor: "pointer" }}>Remove</button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Profile linking */}
                        {profilesAvailable && profiles.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#202124", marginBottom: 8 }}>Profile Links</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {profiles.map(p => {
                                const linked = p.organization_id === orgId;
                                return (
                                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 8px", background: linked ? "#f3e8ff" : "#fafafa", borderRadius: 4 }}>
                                    <span style={{ flex: 1 }}>{p.name}</span>
                                    {linked
                                      ? <button onClick={() => handleUnlinkProfile(p.id)} style={{ fontSize: 11, padding: "2px 8px", background: "#fff", border: "1px solid #dadce0", borderRadius: 4, cursor: "pointer" }}>Unlink</button>
                                      : <button onClick={() => handleLinkProfile(p.id)} style={{ fontSize: 11, padding: "2px 8px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Link to Org</button>
                                    }
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {!isOrgAdmin && profilesAvailable && profiles.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#202124", marginBottom: 8 }}>Your Profiles</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {profiles.map(p => {
                            const linked = p.organization_id === orgId;
                            return (
                              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 8px", background: linked ? "#f3e8ff" : "#fafafa", borderRadius: 4 }}>
                                <span style={{ flex: 1 }}>{p.name}</span>
                                {linked
                                  ? <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>Linked</span>
                                  : <button onClick={() => handleLinkProfile(p.id)} style={{ fontSize: 11, padding: "2px 8px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Link</button>
                                }
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button onClick={handleCreateOrg} style={{ padding: "10px 20px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>Create Organization</button>
                    <span style={{ color: "#5f6368", fontSize: 13 }}>or</span>
                    <button onClick={handleJoinOrg} style={{ padding: "10px 20px", background: "#fff", color: "#7c3aed", border: "1px solid #c4b5fd", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>Join with Invite Code</button>
                  </div>
                )}
              </div>

              {/* ── PORTFOLIOS (admin only) ── */}
              {org && isOrgAdmin && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0891b2", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10, marginTop: 20, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 1, background: "#a5f3fc" }} />
                    Portfolios
                    <div style={{ flex: 1, height: 1, background: "#a5f3fc" }} />
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #dadce0", borderRadius: 12, padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                    {orgPortfolios.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 12 }}>No portfolios yet. Create one to group members and assign a manager.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
                        {orgPortfolios.map(p => {
                          const members = portfolioMemberMap[p.id] || [];
                          return (
                            <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 15, fontWeight: 600, flex: 1, color: "#202124" }}>{p.name}</span>
                                <button onClick={() => handleRenamePortfolio(p.id)} style={{ fontSize: 11, padding: "3px 8px", background: "#f1f3f4", border: "none", borderRadius: 4, cursor: "pointer" }}>Rename</button>
                                <button onClick={() => handleDeletePortfolio(p.id)} style={{ fontSize: 11, padding: "3px 8px", background: "#fce8e6", color: "#d93025", border: "none", borderRadius: 4, cursor: "pointer" }}>Delete</button>
                              </div>
                              {members.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                                  {members.map(m => {
                                    const om = orgMembers.find(x => x.user_id === m.user_id);
                                    return (
                                      <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 8px", background: "#f8fafc", borderRadius: 4 }}>
                                        <span style={{ flex: 1 }}>{om?.display_name || m.user_id.slice(0, 8)}</span>
                                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: m.role === 'manager' ? "#dbeafe" : "#f1f3f4", color: m.role === 'manager' ? "#1d4ed8" : "#5f6368", fontWeight: 600 }}>{m.role}</span>
                                        <button onClick={() => handleTogglePortfolioManager(p.id, m.user_id)} style={{ fontSize: 10, padding: "2px 6px", background: "#fff", border: "1px solid #dadce0", borderRadius: 3, cursor: "pointer" }}>{m.role === 'manager' ? 'Set Member' : 'Set Manager'}</button>
                                        <button onClick={() => handleRemovePortfolioMember(p.id, m.user_id)} style={{ fontSize: 10, padding: "2px 6px", background: "#fce8e6", color: "#d93025", border: "none", borderRadius: 3, cursor: "pointer" }}>Remove</button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {orgMembers.filter(om => !(members.some(m => m.user_id === om.user_id))).map(om => (
                                  <button key={om.user_id} onClick={() => handleAddPortfolioMember(p.id, om.user_id)} style={{ fontSize: 11, padding: "3px 10px", background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", borderRadius: 4, cursor: "pointer" }}>+ {om.display_name || om.user_id.slice(0, 8)}</button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={handleCreatePortfolio} style={{ padding: "8px 16px", background: "#0891b2", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>+ New Portfolio</button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── SECTION 1: WORK STRUCTURE ── */}
          {isOrgProfile && !isOrgAdmin ? (
            <div style={{ background: "#f3e8ff", borderRadius: 12, padding: "16px 20px", marginBottom: 16, fontSize: 13, color: "#6b21a8" }}>
              Customers, projects, work orders, activities, tags, roles, and bill rates are managed by your organization admin. You can set your personal favourites and defaults below.
            </div>
          ) : (
          <>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: "#c5d7f2" }} />
            {isOrgProfile ? "Organization Config" : "Work Structure"}
            <div style={{ flex: 1, height: 1, background: "#c5d7f2" }} />
          </div>

          <AdminCodeList title="Customers" items={activeConfig.customers} onUpdate={cfgUpdate('customers')} color="#1a73e8" />

          <div style={{ marginTop: 16 }}>
            <ProjectEditor
              items={activeConfig.projects}
              templates={activeConfig.activityTemplates || []}
              customers={activeConfig.customers || []}
              onUpdate={cfgUpdate('projects')}
              color="#1a73e8"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <WorkOrderEditor
              items={activeConfig.workOrders}
              projects={activeConfig.projects || []}
              onUpdate={cfgUpdate('workOrders')}
              color="#1a73e8"
            />
          </div>

          {/* ── SECTION 2: ACTIVITIES & CLASSIFICATION ── */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 28, marginBottom: 10, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: "#d4c5f2" }} />
            Activities & Classification
            <div style={{ flex: 1, height: 1, background: "#d4c5f2" }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <ActivityTemplateEditor
              templates={activeConfig.activityTemplates || []}
              onUpdate={cfgUpdate('activityTemplates')}
              color="#8b5cf6"
              favouriteActivities={config.favouriteActivities || []}
              onToggleFav={name => setConfig(prev => {
                const favs = prev.favouriteActivities || [];
                return { ...prev, favouriteActivities: favs.includes(name) ? favs.filter(n => n !== name) : [...favs, name] };
              })}
            />
          </div>

          <div className="wht-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <AdminList title="Default Activities" items={activeConfig.activities} onUpdate={cfgUpdate('activities')} color="#80868b"
              favourites={config.favouriteActivities || []}
              onToggleFav={name => setConfig(prev => {
                const favs = prev.favouriteActivities || [];
                return { ...prev, favouriteActivities: favs.includes(name) ? favs.filter(n => n !== name) : [...favs, name] };
              })}
            />
            <AdminList title="Tags" items={activeConfig.tags} onUpdate={cfgUpdate('tags')} color="#24c1e0"
              favourites={config.favouriteTags || []}
              onToggleFav={name => setConfig(prev => {
                const favs = prev.favouriteTags || [];
                return { ...prev, favouriteTags: favs.includes(name) ? favs.filter(n => n !== name) : [...favs, name] };
              })}
              categories={config.tagCategories || {}}
              onSetCategory={(name, cat) => setConfig(prev => {
                const cats = { ...(prev.tagCategories || {}) };
                if (cat) cats[name] = cat; else delete cats[name];
                return { ...prev, tagCategories: cats };
              })}
            />
          </div>

          {/* ── SECTION 3: RATES & ROLES ── */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e37400", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 28, marginBottom: 10, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: "#f2d8b5" }} />
            Rates & Roles
            <div style={{ flex: 1, height: 1, background: "#f2d8b5" }} />
          </div>

          <div className="wht-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <AdminList title="Roles" items={activeConfig.roles || []} onUpdate={cfgUpdate('roles')} color="#e37400" />
            <AdminList title="Bill Rates" items={activeConfig.billRates || []} onUpdate={cfgUpdate('billRates')} color="#0d904f"
              favourites={config.favouriteBillRates || []}
              onToggleFav={name => setConfig(prev => {
                const favs = prev.favouriteBillRates || [];
                return { ...prev, favouriteBillRates: favs.includes(name) ? favs.filter(n => n !== name) : [...favs, name] };
              })}
            />
          </div>
          </>
          )}

          {/* ── SECTION: BANK HOLIDAYS ── */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#d93025", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 28, marginBottom: 10, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: "#f5c6c2" }} />
            Bank Holidays
            <div style={{ flex: 1, height: 1, background: "#f5c6c2" }} />
          </div>

          <div style={{
            background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12,
            padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
          }}>
            {/* Region selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <label style={{ fontSize: 15, color: "#3c4043" }}>Holiday Region</label>
              <div style={{ display: "flex", gap: 4 }}>
                {[["", "None"], ["england", "England & Wales"], ["scotland", "Scotland"], ["northernireland", "N. Ireland"]].map(([k, l]) => (
                  <button key={k} onClick={() => setConfig(prev => ({ ...prev, bankHolidayRegion: k }))} style={{
                    fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600, padding: "6px 14px",
                    background: config.bankHolidayRegion === k ? "#d93025" : "#ffffff",
                    color: config.bankHolidayRegion === k ? "#fff" : "#5f6368",
                    border: `1px solid ${config.bankHolidayRegion === k ? "#d93025" : "#dadce0"}`,
                    borderRadius: 16, cursor: "pointer"
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Show selected region's holidays */}
            {config.bankHolidayRegion && BANK_HOLIDAYS[config.bankHolidayRegion] && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#5f6368", marginBottom: 8 }}>
                  {BANK_HOLIDAYS[config.bankHolidayRegion].label} holidays ({Object.keys(BANK_HOLIDAYS[config.bankHolidayRegion].dates).length} dates loaded)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Object.entries(BANK_HOLIDAYS[config.bankHolidayRegion].dates)
                    .filter(([d]) => { const y = parseInt(d.split("-")[0]); return y >= now.getFullYear() - 1 && y <= now.getFullYear() + 1; })
                    .map(([d, name]) => (
                    <span key={d} style={{
                      fontSize: 11, padding: "3px 8px", borderRadius: 8,
                      background: d.startsWith(String(now.getFullYear())) ? "#fce8e6" : "#f8f9fa",
                      color: d.startsWith(String(now.getFullYear())) ? "#c5221f" : "#80868b",
                      border: "1px solid #e8eaed"
                    }}>{d.slice(5)} {name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Custom holidays */}
            <div style={{ borderTop: "1px solid #e8eaed", paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#5f6368", marginBottom: 8 }}>Custom Holidays</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <input type="date" id="customHolDate"
                  style={{ background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                <input type="text" id="customHolName" placeholder="Holiday name..."
                  style={{ flex: 1, minWidth: 150, background: "#ffffff", border: "1px solid #dadce0", color: "#202124", padding: "8px 12px", borderRadius: 6, fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, outline: "none" }} />
                <button onClick={() => {
                  const dateEl = document.getElementById("customHolDate");
                  const nameEl = document.getElementById("customHolName");
                  if (dateEl.value && nameEl.value.trim()) {
                    setConfig(prev => ({ ...prev, customHolidays: { ...(prev.customHolidays || {}), [dateEl.value]: nameEl.value.trim() } }));
                    dateEl.value = ""; nameEl.value = "";
                  }
                }} style={{
                  background: "#d93025", border: "none", color: "#ffffff", padding: "8px 16px",
                  borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 700
                }}>+ Add</button>
              </div>
              {Object.keys(config.customHolidays || {}).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Object.entries(config.customHolidays || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([d, name]) => (
                    <span key={d} style={{
                      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 10px",
                      borderRadius: 8, background: "#fce8e6", color: "#c5221f", border: "1px solid #f28b82"
                    }}>
                      {d.slice(5)} {name}
                      <span onClick={() => setConfig(prev => {
                        const h = { ...(prev.customHolidays || {}) }; delete h[d]; return { ...prev, customHolidays: h };
                      })} style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>×</span>
                    </span>
                  ))}
                </div>
              )}
              {Object.keys(config.customHolidays || {}).length === 0 && (
                <div style={{ fontSize: 12, color: "#80868b", fontStyle: "italic" }}>No custom holidays added</div>
              )}
            </div>

            {/* Info */}
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#f8f9fa", borderRadius: 8, fontSize: 12, color: "#5f6368" }}>
              Bank holidays reduce your contracted hours by {fmtH(dailyHrs)}h per holiday ({standardHours}h ÷ 5 days). Time worked on a bank holiday counts toward overtime.
            </div>
          </div>

          {/* ── SECTION 4: DEFAULTS & SETTINGS ── */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#34a853", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 28, marginBottom: 10, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: "#b5e0c5" }} />
            Defaults & Settings
            <div style={{ flex: 1, height: 1, background: "#b5e0c5" }} />
          </div>

          <div style={{
            background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12,
            padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <label style={{ fontSize: 15, color: "#3c4043" }}>Contracted Weekly Hours</label>
              <input
                type="number"
                value={standardHours}
                onChange={e => setStandardHours(e.target.value)}
                step="0.5"
                style={{
                  width: 100, textAlign: "center", background: "#ffffff", border: "1px solid #dadce0",
                  color: "#202124", padding: "10px 14px", borderRadius: 8,
                  fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 18, fontWeight: 600, outline: "none"
                }}
              />
              <span style={{ fontSize: 14, color: "#5f6368" }}>hours/week</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14 }}>
              <label style={{ fontSize: 15, color: "#3c4043" }}>Standard Work Day</label>
              <TimeSel value={defaults.startTime} onChange={v => setDefaults(prev => ({ ...prev, startTime: v }))} />
              <span style={{ fontSize: 14, color: "#5f6368" }}>to</span>
              <TimeSel value={defaults.endTime} onChange={v => setDefaults(prev => ({ ...prev, endTime: v }))} />
            </div>
            <div style={{ height: 1, background: "#e8eaed", margin: "16px 0" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 }}>Defaults for new entries</div>
            <div className="wht-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>Default Customer</div>
                <FavSel value={defaults.customer} onChange={v => setDefaults(prev => ({ ...prev, customer: v }))} options={getItemNames(activeConfig.customers)} configItems={activeConfig.customers} placeholder="— None —" />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>Default Project</div>
                <FavSel value={defaults.project} onChange={v => setDefaults(prev => ({ ...prev, project: v }))} options={getProjectsForCustomer(defaults.customer)} configItems={activeConfig.projects} placeholder="— None —" />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>Default Work Order</div>
                <FavSel value={defaults.workOrder} onChange={v => setDefaults(prev => ({ ...prev, workOrder: v }))} options={getWorkOrdersForProject(defaults.project)} configItems={activeConfig.workOrders} placeholder="— None —" />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>Default Activity</div>
                <FavSel value={defaults.activity} onChange={v => setDefaults(prev => ({ ...prev, activity: v }))} options={getActivitiesForProject(defaults.project)} favouriteNames={config.favouriteActivities || []} placeholder="— None —" />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>Default Role</div>
                <Sel value={defaults.role} onChange={v => setDefaults(prev => ({ ...prev, role: v }))} options={activeConfig.roles || []} placeholder="— None —" />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 5 }}>Default Bill Rate</div>
                <FavSel value={defaults.billRate} onChange={v => setDefaults(prev => ({ ...prev, billRate: v }))} options={activeConfig.billRates || []} favouriteNames={config.favouriteBillRates || []} placeholder="— None —" />
              </div>
            </div>
          </div>

          {/* Daily Quote toggle */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12,
            padding: "14px 24px", marginTop: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#202124" }}>💡 Daily Inspirational Quote</div>
              <div style={{ fontSize: 12, color: "#80868b", marginTop: 2 }}>Show a motivational quote at the top of the app each day</div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={config.showDailyQuote !== false}
                onChange={e => setConfig(prev => ({ ...prev, showDailyQuote: e.target.checked }))}
                style={{ accentColor: "#1a73e8", width: 18, height: 18, cursor: "pointer" }} />
              <span style={{ fontSize: 14, color: "#202124" }}>{config.showDailyQuote !== false ? "On" : "Off"}</span>
            </label>
          </div>

          {/* ── SECTION 5: DATA MANAGEMENT ── */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5f6368", textTransform: "uppercase", letterSpacing: "1.5px", marginTop: 28, marginBottom: 10, padding: "0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: "#dadce0" }} />
            Data Management
            <div style={{ flex: 1, height: 1, background: "#dadce0" }} />
          </div>

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12,
            padding: "14px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#202124" }}>Backup & Restore</div>
              <div style={{ fontSize: 12, color: "#80868b", marginTop: 2 }}>Export your data regularly to prevent data loss</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={exportData} style={{
                background: "#1a73e8", border: "none", color: "#ffffff", padding: "8px 18px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600
              }}>Export Backup</button>
              <button onClick={() => setShowImport(true)} style={{
                background: "#ffffff", border: "1px solid #dadce0", color: "#5f6368", padding: "8px 18px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600
              }}>Import Backup</button>
              <button onClick={exportTimesheet} style={{
                background: "#34a853", border: "none", color: "#ffffff", padding: "8px 18px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600
              }}>Export Timesheet (CSV)</button>
            </div>
          </div>

          {/* Automatic Backups card (Supabase only) */}
          {supabaseConfigured && userId !== "local" && (
            <div style={{
              background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12,
              padding: "18px 24px", marginTop: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#202124" }}>☁️ Automatic Backups</div>
                  <div style={{ fontSize: 12, color: "#80868b", marginTop: 2 }}>
                    Daily cloud snapshot of all your data, up to {BACKUP_KEEP_COUNT} retained.
                  </div>
                </div>
                {!backupsTableMissing && (
                  <button onClick={backupNow} disabled={backupBusy === "creating"} style={{
                    background: backupBusy === "creating" ? "#9aa0a6" : "#1a73e8",
                    border: "none", color: "#ffffff", padding: "8px 18px",
                    borderRadius: 20, cursor: backupBusy === "creating" ? "not-allowed" : "pointer",
                    fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600
                  }}>{backupBusy === "creating" ? "Backing up..." : "Back Up Now"}</button>
                )}
              </div>

              {backupsTableMissing ? (
                <div style={{
                  marginTop: 14, padding: "14px 16px", background: "#fef7e0",
                  border: "1px solid #feefc3", borderRadius: 8, fontSize: 13, color: "#5f4400"
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Setup required</div>
                  <div style={{ marginBottom: 8 }}>
                    To enable automatic backups, run the migration
                    <code style={{ background: "#fff5d6", padding: "1px 6px", borderRadius: 4, margin: "0 4px", fontFamily: "monospace", fontSize: 12 }}>
                      003_add_backups_table.sql
                    </code>
                    in your Supabase SQL editor. Reload the app after the migration completes.
                  </div>
                </div>
              ) : backups.length === 0 ? (
                <div style={{ marginTop: 14, fontSize: 13, color: "#80868b" }}>
                  No backups yet. Your first automatic backup will be created shortly, or click "Back Up Now".
                </div>
              ) : (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {backups.map(b => {
                    const sizeKb = ((b.size_bytes || 0) / 1024).toFixed(1);
                    const busy = backupBusy === b.id;
                    return (
                      <div key={b.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 12, flexWrap: "wrap",
                        padding: "10px 14px", background: "#f8f9fa",
                        border: "1px solid #e8eaed", borderRadius: 8
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: "1 1 240px" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#202124" }}>
                            {new Date(b.created_at).toLocaleString()}
                          </div>
                          <div style={{ fontSize: 12, color: "#80868b" }}>
                            {b.label === "manual" ? "Manual" : "Automatic"} · {sizeKb} KB
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => downloadBackup(b.id)} disabled={busy} style={{
                            background: "#ffffff", border: "1px solid #dadce0", color: "#1a73e8",
                            padding: "6px 12px", borderRadius: 16,
                            cursor: busy ? "not-allowed" : "pointer",
                            fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                          }}>Download</button>
                          <button onClick={() => restoreBackup(b.id)} disabled={busy} style={{
                            background: "#ffffff", border: "1px solid #dadce0", color: "#137333",
                            padding: "6px 12px", borderRadius: 16,
                            cursor: busy ? "not-allowed" : "pointer",
                            fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                          }}>Restore</button>
                          <button onClick={() => removeBackup(b.id)} disabled={busy} style={{
                            background: "#ffffff", border: "1px solid #dadce0", color: "#d93025",
                            padding: "6px 12px", borderRadius: 16,
                            cursor: busy ? "not-allowed" : "pointer",
                            fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                          }}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Profiles card (Supabase only) */}
          {supabaseConfigured && userId !== "local" && (
            <div style={{
              background: "#ffffff", border: "1px solid #dadce0", borderRadius: 12,
              padding: "18px 24px", marginTop: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#202124" }}>👥 Profiles</div>
                  <div style={{ fontSize: 12, color: "#80868b", marginTop: 2 }}>
                    Keep separate sets of customers, projects, tasks, and time entries (e.g. Work vs Personal).
                  </div>
                </div>
                {profilesAvailable && (
                  <button onClick={() => {
                    const name = window.prompt("New profile name:", "");
                    if (name) addProfile(name);
                  }} style={{
                    background: "#1a73e8", border: "none", color: "#ffffff", padding: "8px 18px",
                    borderRadius: 20, cursor: "pointer",
                    fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600
                  }}>+ New Profile</button>
                )}
              </div>

              {!profilesAvailable ? (
                <div style={{
                  marginTop: 14, padding: "14px 16px", background: "#fef7e0",
                  border: "1px solid #feefc3", borderRadius: 8, fontSize: 13, color: "#5f4400"
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Setup required</div>
                  <div>
                    To enable multiple profiles, run the migration
                    <code style={{ background: "#fff5d6", padding: "1px 6px", borderRadius: 4, margin: "0 4px", fontFamily: "monospace", fontSize: 12 }}>
                      004_add_profiles.sql
                    </code>
                    in your Supabase SQL editor, then reload the app.
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {profiles.map(p => {
                    const isActive = p.id === activeProfileId;
                    return (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 12, flexWrap: "wrap",
                        padding: "10px 14px",
                        background: isActive ? "#e8f0fe" : "#f8f9fa",
                        border: `1px solid ${isActive ? "#1a73e8" : "#e8eaed"}`,
                        borderRadius: 8
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: "1 1 240px" }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#202124" }}>
                            {p.name}{isActive && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#1a73e8", background: "#ffffff", padding: "2px 8px", borderRadius: 8, border: "1px solid #1a73e8" }}>Active</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#80868b" }}>
                            {p.id === "default" ? "Default profile" : `ID: ${p.id}`}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {!isActive && (
                            <button onClick={() => switchProfile(p.id)} style={{
                              background: "#1a73e8", border: "1px solid #1a73e8", color: "#ffffff",
                              padding: "6px 12px", borderRadius: 16, cursor: "pointer",
                              fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                            }}>Switch</button>
                          )}
                          <button onClick={() => {
                            const n = window.prompt("Rename profile:", p.name);
                            if (n && n.trim()) renameProfileAction(p.id, n.trim());
                          }} style={{
                            background: "#ffffff", border: "1px solid #dadce0", color: "#5f6368",
                            padding: "6px 12px", borderRadius: 16, cursor: "pointer",
                            fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                          }}>Rename</button>
                          {p.id !== "default" && (
                            <button onClick={() => removeProfile(p.id)} style={{
                              background: "#ffffff", border: "1px solid #dadce0", color: "#d93025",
                              padding: "6px 12px", borderRadius: 16, cursor: "pointer",
                              fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 12, fontWeight: 600
                            }}>Delete</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        ); })()}

      {/* Export Modal */}
      {showExport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowExport(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#ffffff", borderRadius: 16, padding: "24px 28px", maxWidth: 600, width: "90%",
            maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 30px rgba(0,0,0,0.2)"
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#202124", marginBottom: 8 }}>Export Backup</div>
            <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 12 }}>Copy the text below and save it to a file. To restore, paste it into Import.</div>
            <textarea readOnly value={showExport} style={{
              flex: 1, minHeight: 200, background: "#f8f9fa", border: "1px solid #dadce0", borderRadius: 8,
              padding: 12, fontFamily: "monospace", fontSize: 12, color: "#202124", resize: "vertical", outline: "none"
            }} onFocus={e => e.target.select()} />
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button onClick={() => { navigator.clipboard.writeText(showExport).then(() => { setSaveStatus("copied"); setTimeout(() => setSaveStatus(""), 2000); }); }} style={{
                background: "#1a73e8", border: "none", color: "#fff", padding: "10px 24px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 600
              }}>Copy to Clipboard</button>
              <button onClick={() => setShowExport(null)} style={{
                background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "10px 20px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => { setShowImport(false); setImportText(""); }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#ffffff", borderRadius: 16, padding: "24px 28px", maxWidth: 600, width: "90%",
            maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 30px rgba(0,0,0,0.2)"
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#202124", marginBottom: 8 }}>Import Backup</div>
            <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 12 }}>Paste your previously exported backup JSON below.</div>
            <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste backup JSON here..."
              style={{
                flex: 1, minHeight: 200, background: "#f8f9fa", border: "1px solid #dadce0", borderRadius: 8,
                padding: 12, fontFamily: "monospace", fontSize: 12, color: "#202124", resize: "vertical", outline: "none"
              }} />
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button onClick={doImport} disabled={!importText.trim()} style={{
                background: importText.trim() ? "#34a853" : "#dadce0", border: "none", color: "#fff", padding: "10px 24px",
                borderRadius: 20, cursor: importText.trim() ? "pointer" : "not-allowed", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 600
              }}>Restore Data</button>
              <button onClick={() => { setShowImport(false); setImportText(""); }} style={{
                background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "10px 20px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Timesheet Export Modal */}
      {showTimesheetExport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowTimesheetExport(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#ffffff", borderRadius: 16, padding: "24px 28px", maxWidth: 700, width: "90%",
            maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 30px rgba(0,0,0,0.2)"
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#202124", marginBottom: 8 }}>Export Timesheet</div>
            <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 12 }}>CSV format — copy and paste into a spreadsheet or save as a .csv file.</div>
            <textarea readOnly value={showTimesheetExport} style={{
              flex: 1, minHeight: 250, background: "#f8f9fa", border: "1px solid #dadce0", borderRadius: 8,
              padding: 12, fontFamily: "monospace", fontSize: 11, color: "#202124", resize: "vertical", outline: "none", whiteSpace: "pre"
            }} onFocus={e => e.target.select()} />
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button onClick={() => { navigator.clipboard.writeText(showTimesheetExport).then(() => { setSaveStatus("copied"); setTimeout(() => setSaveStatus(""), 2000); }); }} style={{
                background: "#34a853", border: "none", color: "#fff", padding: "10px 24px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14, fontWeight: 600
              }}>Copy to Clipboard</button>
              <button onClick={() => setShowTimesheetExport(null)} style={{
                background: "#f1f3f4", border: "1px solid #dadce0", color: "#5f6368", padding: "10px 20px",
                borderRadius: 20, cursor: "pointer", fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undoVisible && undoStack.length > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 100,
          display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
          background: "#323232", color: "#fff", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 14
        }}>
          <span>{undoStack[undoStack.length - 1].action === "deleteTask" ? "Task deleted" :
            undoStack[undoStack.length - 1].action === "completeTask" ? "Task completed" :
            undoStack[undoStack.length - 1].action === "cancelTask" ? "Task cancelled" :
            undoStack[undoStack.length - 1].action === "deleteEntry" ? "Entry deleted" : "Action done"}</span>
          <button onClick={performUndo} style={{
            background: "transparent", border: "none", color: "#8ab4f8", cursor: "pointer",
            fontSize: 14, fontWeight: 700, textDecoration: "underline"
          }}>Undo</button>
          <button onClick={() => setUndoVisible(false)} style={{
            background: "transparent", border: "none", color: "#80868b", cursor: "pointer", fontSize: 16
          }}>✕</button>
        </div>
      )}

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowShortcuts(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 16, padding: "28px 36px", maxWidth: 500, width: "90%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#202124" }}>⌨️ Keyboard Shortcuts</div>
              <button onClick={() => setShowShortcuts(false)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#5f6368" }}>✕</button>
            </div>
            {[
              ["Ctrl + C", "Copy selected time entry"],
              ["Ctrl + V", "Paste entry into selection / timer / new"],
              ["Enter", "Close entry edit panel / Collapse task"],
              ["Escape", "Close edit panel / Close dropdown"],
              ["Delete / Backspace", "Delete selected time entry"],
              ["Tab", "Select autocomplete suggestion"],
              ["↑ ↓ arrows", "Navigate autocomplete suggestions"],
              ["Ctrl + Z", "Undo last action"],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f3f4" }}>
                <kbd style={{ background: "#f1f3f4", padding: "3px 10px", borderRadius: 6, fontSize: 13, fontWeight: 600, color: "#202124", fontFamily: "monospace" }}>{key}</kbd>
                <span style={{ fontSize: 13, color: "#5f6368" }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 36, paddingTop: 18, borderTop: "1px solid #dadce0", fontSize: 13, color: "#6a6a70", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span>Data saves automatically</span>
        {lastSaved && (
          <>
            <span>·</span>
            <span>Last saved {lastSaved.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          </>
        )}
        <span>·</span>
        <button onClick={refreshFromStorage} style={{
          background: "transparent", border: "none", color: "#1a73e8", cursor: "pointer",
          fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, padding: 0,
          textDecoration: "underline"
        }}>Refresh data</button>
        <span>·</span>
        <button onClick={() => setShowShortcuts(true)} style={{
          background: "transparent", border: "none", color: "#1a73e8", cursor: "pointer",
          fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, padding: 0,
          textDecoration: "underline"
        }}>⌨️ Shortcuts</button>
        {onImport && (
          <>
            <span>·</span>
            <button onClick={onImport} style={{
              background: "transparent", border: "none", color: "#1a73e8", cursor: "pointer",
              fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, padding: 0,
              textDecoration: "underline"
            }}>📦 Import Data</button>
          </>
        )}
        {supabaseConfigured && (
          <>
            <span>·</span>
            <span style={{ fontSize: 12, color: "#80868b" }}>{user?.email}</span>
            <button onClick={() => supabase.auth.signOut()} style={{
              background: "transparent", border: "none", color: "#d93025", cursor: "pointer",
              fontFamily: "'Inter', 'Roboto', sans-serif", fontSize: 13, fontWeight: 600, padding: 0,
              textDecoration: "underline"
            }}>Sign out</button>
          </>
        )}
      </div>
    </div>
  );
}
