"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { MAX_TEAM_NAME } from "@/lib/config";
import {
  CTF_CHALLENGES,
  FLAG_FORMAT,
  SECTION_COLOR,
  type CtfChallengeContent,
  type CtfSection,
} from "@/lib/ctf/content";
import type { CtfStatePayload, PublicQuestion, PublicSection } from "@/lib/ctf/state-view";
import Board from "./Board";
import { ArrowLeft, Bang, Bars, Check, Download, Lock, Spider, ZipFile } from "./icons";

/**
 * The whole CTF, at one URL.
 *
 * Screens: join → start → dashboard, and a full-screen challenge detail that
 * replaces the dashboard when a card is opened (the "Back to Challenges" view).
 * Everything comes from a single /api/ctf/state poll, so the cards, the clock
 * and the standings can never disagree.
 *
 * QUESTION TEXT IS NOT POLLED. Titles, explanations and payloads are static and
 * public, so they are imported straight from the content module. The poll
 * carries only what changes: who solved what, and when.
 */

const POLL_MS = 5_000;

const BY_SLUG = new Map<string, CtfChallengeContent>(CTF_CHALLENGES.map((c) => [c.slug, c]));

interface Verdict {
  ok: boolean;
  message: string;
}

export default function CtfBoard({ initial }: { initial: CtfStatePayload }) {
  const [state, setState] = useState<CtfStatePayload>(initial);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const [anchor, setAnchor] = useState(() => ({
    elapsedMs: initial.run?.elapsedMs ?? 0,
    at: 0,
  }));

  const applyState = useCallback((next: CtfStatePayload) => {
    setState(next);
    setAnchor({ elapsedMs: next.run?.elapsedMs ?? 0, at: Date.now() });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ctf/state", { cache: "no-store" });
      if (!res.ok) return;
      applyState((await res.json()) as CtfStatePayload);
    } catch {
      // A dropped poll during a burst is normal. The next tick recovers.
    }
  }, [applyState]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // ── Screen 1: no team yet ────────────────────────────────────────────────
  if (!state.team) {
    return (
      <div className="bru-cols">
        <JoinPanel teamCount={state.teamCount} onJoined={applyState} />
        <aside className="bru-side">
          <div className="bru-box">
            <Board state={state} />
          </div>
        </aside>
      </div>
    );
  }

  // ── Screen 2: on a team, clock not started ───────────────────────────────
  if (!state.run?.started) {
    return (
      <div className="bru-cols">
        <StartPanel teamName={state.team.teamName} onStarted={applyState} />
        <aside className="bru-side">
          <div className="bru-box">
            <Board state={state} />
          </div>
        </aside>
      </div>
    );
  }

  const run = state.run;
  const located = openSlug ? locateQuestion(run, openSlug) : undefined;

  // ── Screen 4: a single challenge, full screen ────────────────────────────
  if (located) {
    return (
      <ChallengeDetail
        // Remount per question so the flag field and verdict reset themselves,
        // rather than clearing them from an effect (which the compiler rejects).
        key={located.question.slug}
        located={located}
        onBack={() => setOpenSlug(null)}
        onSolved={refresh}
      />
    );
  }

  // ── Screen 3: the dashboard ──────────────────────────────────────────────
  return (
    <div className="bru-dash">
      <div className="bru-columns">
        {run.sections.map((section) => (
          <SectionColumn key={section.section} section={section} onOpen={setOpenSlug} />
        ))}
      </div>

      <aside className="bru-side">
        <ActiveTeamCard run={run} anchor={anchor} teamName={state.team.teamName} />
        <div className="bru-box bru-leader">
          <Board state={state} />
        </div>
      </aside>
    </div>
  );
}

/* ── Time ─────────────────────────────────────────────────────────────── */

function subscribeToSecond(onChange: () => void): () => void {
  const id = setInterval(onChange, 1_000);
  return () => clearInterval(id);
}

const nowSnapshot = () => Math.floor(Date.now() / 1_000) * 1_000;
const serverSnapshot = () => 0;

export interface ClockAnchor {
  elapsedMs: number;
  at: number;
}

/** h:mm:ss once past an hour, m:ss below it. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function useElapsed(anchor: ClockAnchor, frozen: boolean): number {
  const now = useSyncExternalStore(subscribeToSecond, nowSnapshot, serverSnapshot);

  if (frozen) return anchor.elapsedMs;
  if (now === 0 || anchor.at === 0) return anchor.elapsedMs;
  return anchor.elapsedMs + Math.max(0, now - anchor.at);
}

/* ── Join ─────────────────────────────────────────────────────────────── */

function JoinPanel({
  teamCount,
  onJoined,
}: {
  teamCount: number;
  onJoined: (s: CtfStatePayload) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ctf/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not join");
        return;
      }
      const fresh = await fetch("/api/ctf/state", { cache: "no-store" });
      onJoined((await fresh.json()) as CtfStatePayload);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bru-hero">
      <p className="bru-kicker">Step 1 of 2</p>
      <h2 className="bru-h2">Name your team</h2>
      <p>
        One person per team enters a name. Everyone else can watch the same board
        from their own screen.
      </p>

      <form className="bru-form" onSubmit={join}>
        <input
          className="bru-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="TEAM NAME"
          aria-label="Team name"
          maxLength={MAX_TEAM_NAME}
          autoComplete="off"
          disabled={busy}
          autoFocus
        />
        <button className="bru-btn bru-btn-go" type="submit" disabled={busy || !name.trim()}>
          {busy ? "..." : "Join"}
        </button>
      </form>

      {error && (
        <p className="bru-verdict bru-verdict-bad" role="alert">
          {error}
        </p>
      )}

      <ul className="bru-rules">
        <li>8 questions — 3 easy, 3 medium, 2 hard. All open from the start.</li>
        <li>100 / 150 / 200 points. Solve them in any order you like.</li>
        <li>Your clock starts when YOU press Start, and stops on your last solve.</li>
        <li>
          {teamCount === 0
            ? "No teams registered yet."
            : `${teamCount} team${teamCount === 1 ? "" : "s"} registered.`}
        </li>
      </ul>
    </div>
  );
}

/* ── Start ────────────────────────────────────────────────────────────── */

function StartPanel({
  teamName,
  onStarted,
}: {
  teamName: string;
  onStarted: (s: CtfStatePayload) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ctf/start", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not start");
        return;
      }
      const fresh = await fetch("/api/ctf/state", { cache: "no-store" });
      onStarted((await fresh.json()) as CtfStatePayload);
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bru-hero bru-start">
      <p className="bru-kicker">Step 2 of 2</p>
      <h2 className="bru-h2">{teamName}</h2>

      <ul className="bru-rules">
        <li>Your timer starts the moment you press this. Nobody else&apos;s does.</li>
        <li>There is no deadline. The clock stops when you solve the eighth question.</li>
        <li>Equal scores are separated by the shorter run, so speed counts.</li>
      </ul>

      <button className="bru-btn bru-btn-go bru-btn-xl" onClick={start} disabled={busy}>
        <Spider size={22} />
        {busy ? "Starting..." : "Start the clock"}
      </button>

      {error && (
        <p className="bru-verdict bru-verdict-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Active team card ─────────────────────────────────────────────────── */

function ActiveTeamCard({
  run,
  anchor,
  teamName,
}: {
  run: NonNullable<CtfStatePayload["run"]>;
  anchor: ClockAnchor;
  teamName: string;
}) {
  const elapsed = useElapsed(anchor, run.finished);

  return (
    <div className="bru-team-card-wrap">
      <div className="bru-team-card">
        <span className="bru-team-emblem">
          <Spider size={28} />
        </span>
        <div>
          <p className="bru-team-label">Active team</p>
          <p className="bru-team-name">{teamName}</p>
          <p className="bru-team-points">Total secured points: {run.points}</p>
        </div>
      </div>

      <div className="bru-team-stats">
        <div className="bru-team-stat">
          <span className="bru-team-stat-label">{run.finished ? "Final" : "Elapsed"}</span>
          <span className="bru-team-stat-value is-clock" role="timer" aria-live="off">
            {formatDuration(elapsed)}
          </span>
        </div>
        <div className="bru-team-stat">
          <span className="bru-team-stat-label">Solved</span>
          <span className="bru-team-stat-value">
            {run.totalSolved}/{run.totalQuestions}
          </span>
        </div>
        <div className="bru-team-stat">
          <span className="bru-team-stat-label">Points</span>
          <span className="bru-team-stat-value">{run.points}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Difficulty column ────────────────────────────────────────────────── */

function SectionColumn({
  section,
  onOpen,
}: {
  section: PublicSection;
  onOpen: (slug: string) => void;
}) {
  const accent = SECTION_COLOR[section.section as CtfSection];

  return (
    <section className="bru-col" style={{ ["--accent" as string]: accent }}>
      <div className="bru-col-head">
        <span className="bru-col-name">{section.name}</span>
        <span className="bru-col-count">({section.total})</span>
      </div>

      {section.questions.map((q) => (
        <QuestionCard key={q.slug} question={q} section={section} onOpen={onOpen} />
      ))}
    </section>
  );
}

function QuestionCard({
  question,
  section,
  onOpen,
}: {
  question: PublicQuestion;
  section: PublicSection;
  onOpen: (slug: string) => void;
}) {
  const content = BY_SLUG.get(question.slug);
  if (!content) return null;

  const solved = question.solved;

  return (
    <button
      type="button"
      className={`bru-card${solved ? " bru-card-solved" : ""}`}
      onClick={() => onOpen(question.slug)}
    >
      <div className="bru-card-top">
        <h3 className="bru-card-title">{content.title}</h3>
        <span className="bru-points">
          <b>{section.points}</b>
          <span>PTS</span>
        </span>
      </div>

      <div className="bru-pill-row">
        <span className="bru-pill-cat">
          <Lock size={12} />
          {content.category}
        </span>
        <span className="bru-pill-diff">
          <Bars size={12} />
          {section.name}
        </span>
      </div>

      <p className="bru-card-brief">{content.brief}</p>

      <div className="bru-card-actions">
        {solved ? (
          <span className="bru-status bru-status-done">
            <Check size={14} /> Solved
          </span>
        ) : (
          <span className="bru-status bru-status-todo">
            <Bang size={14} /> Unsolved
          </span>
        )}
        <span className="bru-card-cta">{solved ? "Review" : "Solve"} →</span>
      </div>
    </button>
  );
}

/* ── Challenge detail (full screen) ───────────────────────────────────── */

function ChallengeDetail({
  located,
  onBack,
  onSolved,
}: {
  located: { question: PublicQuestion; section: PublicSection };
  onBack: () => void;
  onSolved: () => void;
}) {
  const { question, section } = located;
  const content = BY_SLUG.get(question.slug);
  const [flag, setFlag] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  // Bring the top of the detail into view when it takes over the screen. This
  // syncs an external system (scroll position), not React state, so it belongs
  // in an effect. The component is remounted per question (keyed by the parent),
  // so this runs once per open.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  if (!content) return null;

  const accent = SECTION_COLOR[section.section as CtfSection];
  const solved = question.solved;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = flag.trim();
    if (!value) return;

    setBusy(true);
    setVerdict(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "ctf", challengeSlug: question.slug, payload: value }),
      });
      const data = await res.json();

      if (res.status === 429) {
        setVerdict({ ok: false, message: "Slow down — too many attempts." });
        return;
      }
      if (!res.ok) {
        setVerdict({ ok: false, message: data.error ?? "That didn't work." });
        return;
      }

      if (data.correct) {
        const meta = data.meta ?? {};
        setFlag("");
        setVerdict({
          ok: true,
          message: meta.clearsEvent
            ? `That's all ${meta.total} — your clock has stopped. +${data.points}`
            : `Correct. +${data.points} points (${meta.solved} of ${meta.total} solved)`,
        });
      } else {
        setVerdict({ ok: false, message: reasonText(data.meta?.reason) });
      }
      onSolved();
    } catch {
      setVerdict({ ok: false, message: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bru-detail" style={{ ["--accent" as string]: accent }}>
      <button type="button" className="bru-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to Challenges
      </button>

      <div className="bru-detail-panel">
        <div className="bru-detail-head">
          <div className="bru-detail-title">
            <span className="bru-emblem">
              <Spider size={28} />
            </span>
            <h2>{content.title}</h2>
          </div>
          <span className="bru-points-badge">
            <b>{section.points}</b>
            <span>POINTS</span>
          </span>
        </div>

        <div className="bru-detail-pills">
          <span className="bru-pill-cat">
            <Lock size={13} />
            {content.category}
          </span>
          <span className="bru-pill-diff">
            <Bars size={13} />
            {section.name}
          </span>
        </div>

        {content.attachments.length > 0 && (
          <div className="bru-attach">
            <span className="bru-attach-icon">
              <ZipFile size={26} />
            </span>
            <div className="bru-attach-meta">
              <b>{content.attachments[0].split("/").pop()}</b>
              <span>Challenge file</span>
            </div>
            <div className="bru-files">
              {content.attachments.map((name) => (
                <a
                  key={name}
                  className="bru-file"
                  href={`/api/ctf/attachment?challenge=${encodeURIComponent(content.slug)}&name=${encodeURIComponent(name)}`}
                >
                  <Download size={15} /> {name.split("/").pop()}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="bru-block">
          <h3 className="bru-block-title">
            <Spider size={16} /> Briefing
          </h3>
          <div className="bru-block-body">
            <p className="bru-prose">{content.prompt}</p>
          </div>
        </div>

        {content.payload && (
          <div className="bru-block">
            <h3 className="bru-block-title">
              <Spider size={16} /> The payload
            </h3>
            <pre className="bru-payload" tabIndex={0}>
              {content.payload}
            </pre>
          </div>
        )}

        <div className="bru-block">
          <h3 className="bru-block-title">
            <Spider size={16} /> Submission
          </h3>
          {solved ? (
            <p className="bru-verdict bru-verdict-good">
              Solved{question.solvedAt ? ` at ${timeOfDay(question.solvedAt)}` : ""}. Worth{" "}
              {section.points} points.
            </p>
          ) : (
            <form className="bru-submit-row" onSubmit={submit}>
              <input
                className="bru-input"
                value={flag}
                onChange={(e) => setFlag(e.target.value)}
                placeholder={`Enter your flag here...  ${FLAG_FORMAT}`}
                aria-label="Your flag"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                autoFocus
              />
              <button className="bru-btn bru-submit" type="submit" disabled={busy || !flag.trim()}>
                <Spider size={18} />
                {busy ? "..." : "Submit"}
              </button>
            </form>
          )}

          {verdict && (
            <p
              className={`bru-verdict ${verdict.ok ? "bru-verdict-good" : "bru-verdict-bad"}`}
              role="status"
              aria-live="polite"
            >
              {verdict.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Find a question and the section holding it. Deliberately NOT memoized: it is a
 * scan of eight items, and a useMemo over the whole run object defeats the React
 * Compiler for the entire component, which costs more than the scan.
 */
function locateQuestion(
  run: NonNullable<CtfStatePayload["run"]>,
  slug: string
): { question: PublicQuestion; section: PublicSection } | undefined {
  for (const section of run.sections) {
    const found = section.questions.find((q) => q.slug === slug);
    if (found) return { question: found, section };
  }
  return undefined;
}

function reasonText(reason: unknown): string {
  switch (reason) {
    case "already-solved":
      return "Your team has already solved this one.";
    case "not-started":
      return "Press Start before submitting anything.";
    case "unknown-question":
      return "That question is not part of this event.";
    default:
      return "Not the flag. Try again.";
  }
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
