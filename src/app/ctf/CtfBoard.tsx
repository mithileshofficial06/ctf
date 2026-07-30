"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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

/**
 * The whole CTF, at one URL.
 *
 * Three screens — join, start, play — because they are three states of one
 * thing, not three pages. Everything on screen comes from a single
 * /api/ctf/state poll, so the questions, the clock and the standings cannot
 * disagree with each other.
 *
 * QUESTION TEXT IS NOT POLLED. Titles, explanations and payloads are static and
 * public, so they are imported straight from the content module and live in the
 * bundle. The poll carries only what changes: who solved what, and when.
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

  /**
   * The clock's anchor: the elapsed time the server last reported, and the
   * local instant we received it.
   *
   * Ticking from these two rather than from `Date.now() - startedAt` is what
   * keeps a laptop with a wrong clock honest — only the DELTA since the last
   * poll comes from the local clock, and it is re-anchored every five seconds.
   */
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
      // A dropped poll during a burst is normal. The next tick recovers, and a
      // stale board for five seconds beats an error banner over a live event.
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
          <Board state={state} />
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
          <Board state={state} />
        </aside>
      </div>
    );
  }

  const run = state.run;

  return (
    <div className="bru-cols">
      <div>
        <StatusStrip run={run} anchor={anchor} />

        {run.sections.map((section) => (
          <SectionBlock
            key={section.section}
            section={section}
            onOpen={setOpenSlug}
          />
        ))}
      </div>

      <aside className="bru-side">
        <Board state={state} />
      </aside>

      <QuestionDialog
        slug={openSlug}
        run={run}
        onClose={() => setOpenSlug(null)}
        onSolved={refresh}
      />
    </div>
  );
}

/* ── Time ─────────────────────────────────────────────────────────────── */

function subscribeToSecond(onChange: () => void): () => void {
  const id = setInterval(onChange, 1_000);
  return () => clearInterval(id);
}

const nowSnapshot = () => Math.floor(Date.now() / 1_000) * 1_000;
/** 0 means "no trustworthy clock yet", so the server and the first client paint agree. */
const serverSnapshot = () => 0;

export interface ClockAnchor {
  elapsedMs: number;
  /** Local receipt time. 0 before the first client-side poll. */
  at: number;
}

/** h:mm:ss once past an hour, m:ss below it. Always zero-padded after the first field. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Elapsed time, ticking between polls.
 *
 * Frozen runs return the server's number untouched — a finished team's time is
 * a result, not a clock, and must not drift by a second every render.
 */
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
      // Pull the full state rather than trusting the join response — this is
      // the same payload the poll uses, so the screen switches consistently.
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

/* ── Status ───────────────────────────────────────────────────────────── */

function StatusStrip({
  run,
  anchor,
}: {
  run: NonNullable<CtfStatePayload["run"]>;
  anchor: ClockAnchor;
}) {
  const elapsed = useElapsed(anchor, run.finished);

  return (
    <div className="bru-strip">
      <div className={`bru-stat ${run.finished ? "bru-stat-done" : "bru-stat-clock"}`}>
        <span className="bru-stat-label">{run.finished ? "Final time" : "Elapsed"}</span>
        <span className="bru-stat-value" role="timer" aria-live="off">
          {formatDuration(elapsed)}
        </span>
      </div>
      <div className="bru-stat">
        <span className="bru-stat-label">Score</span>
        <span className="bru-stat-value">{run.points}</span>
      </div>
      <div className="bru-stat">
        <span className="bru-stat-label">Solved</span>
        <span className="bru-stat-value">
          {run.totalSolved}/{run.totalQuestions}
        </span>
      </div>
    </div>
  );
}

/* ── Sections ─────────────────────────────────────────────────────────── */

function SectionBlock({
  section,
  onOpen,
}: {
  section: PublicSection;
  onOpen: (slug: string) => void;
}) {
  const accent = SECTION_COLOR[section.section as CtfSection];

  return (
    <section className="bru-section" style={{ ["--accent" as string]: accent }}>
      <div className="bru-section-head">
        <h2 className="bru-h2">{section.name}</h2>
        <span className="bru-section-tag">
          {section.points} pts each · {section.solvedCount}/{section.total} solved
        </span>
      </div>

      <div className="bru-grid">
        {section.questions.map((q) => (
          <QuestionCard key={q.slug} question={q} sectionName={section.name} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function QuestionCard({
  question,
  sectionName,
  onOpen,
}: {
  question: PublicQuestion;
  sectionName: string;
  onOpen: (slug: string) => void;
}) {
  const content = BY_SLUG.get(question.slug);
  if (!content) return null;

  return (
    <button
      type="button"
      className={`bru-card${question.solved ? " bru-card-solved" : ""}`}
      onClick={() => onOpen(question.slug)}
    >
      <span className="bru-card-num">
        <span>
          {sectionName} {question.order}
        </span>
        {question.solved && <span className="bru-solved-mark">Solved</span>}
      </span>

      <span className="bru-card-body">
        <h3 className="bru-h3">{content.title}</h3>
        <p>{content.brief}</p>
      </span>

      <span className="bru-card-foot">
        <span>{question.solved ? "Review" : "Open"}</span>
        <span aria-hidden="true">→</span>
      </span>
    </button>
  );
}

/* ── Dialog ───────────────────────────────────────────────────────────── */

/**
 * The question, in full.
 *
 * A native <dialog> with showModal(), so focus trapping, Esc-to-close, inert
 * background and the top layer all come from the platform. A hand-rolled
 * div-with-a-backdrop gets every one of those wrong by default.
 */
function QuestionDialog({
  slug,
  run,
  onClose,
  onSolved,
}: {
  slug: string | null;
  run: NonNullable<CtfStatePayload["run"]>;
  onClose: () => void;
  onSolved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [flag, setFlag] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const content = slug ? BY_SLUG.get(slug) : undefined;
  const question = slug ? locateQuestion(run, slug) : undefined;

  // Drive the dialog element from the open slug, rather than tracking two
  // sources of truth that can disagree about whether it is showing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (slug && !el.open) {
      setFlag("");
      setVerdict(null);
      el.showModal();
    } else if (!slug && el.open) {
      el.close();
    }
  }, [slug]);

  if (!content || !question) {
    // Still rendered so the ref exists and the effect above has something to
    // drive; simply empty until a question is chosen.
    return <dialog ref={ref} className="bru-dialog" onClose={onClose} />;
  }

  const solved = question.question.solved;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = flag.trim();
    if (!value || !slug) return;

    setBusy(true);
    setVerdict(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "ctf", challengeSlug: slug, payload: value }),
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
      // The server decides what is solved now, never the client.
      onSolved();
    } catch {
      setVerdict({ ok: false, message: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="bru-dialog"
      onClose={onClose}
      style={{ ["--accent" as string]: SECTION_COLOR[question.section.section as CtfSection] }}
      aria-labelledby="bru-dialog-title"
    >
      <div className="bru-dialog-head">
        <div>
          <p className="bru-kicker">
            {question.section.name} {question.question.order} · {question.section.points} points
          </p>
          <h2 className="bru-h2" id="bru-dialog-title">
            {content.title}
          </h2>
        </div>
        <button type="button" className="bru-dialog-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="bru-dialog-body">
        <p className="bru-prose">{content.prompt}</p>

        {content.payload && (
          <>
            <span className="bru-label">The payload</span>
            <pre className="bru-payload" tabIndex={0}>
              {content.payload}
            </pre>
          </>
        )}

        {content.attachments.length > 0 && (
          <div className="bru-files">
            {content.attachments.map((name) => (
              <a
                key={name}
                className="bru-file"
                href={`/api/ctf/attachment?challenge=${encodeURIComponent(content.slug)}&name=${encodeURIComponent(name)}`}
              >
                ↓ {name.split("/").pop()}
              </a>
            ))}
          </div>
        )}

        {solved ? (
          <p className="bru-verdict bru-verdict-good">
            Solved{question.question.solvedAt ? ` at ${timeOfDay(question.question.solvedAt)}` : ""}. Worth{" "}
            {question.section.points} points.
          </p>
        ) : (
          <>
            <label className="bru-label" htmlFor="bru-flag">
              Your flag
            </label>
            <form className="bru-form" onSubmit={submit} style={{ marginTop: 0 }}>
              <input
                id="bru-flag"
                className="bru-input"
                value={flag}
                onChange={(e) => setFlag(e.target.value)}
                placeholder={FLAG_FORMAT}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
              <button className="bru-btn bru-btn-go" type="submit" disabled={busy || !flag.trim()}>
                {busy ? "..." : "Submit"}
              </button>
            </form>
          </>
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
    </dialog>
  );
}

/**
 * Find a question and the section holding it.
 *
 * Deliberately NOT memoized: it is a scan of eight items, and wrapping it in a
 * useMemo whose dependency is the whole run object defeated the React Compiler
 * outright — it could not prove the memo was preserved and skipped optimizing
 * the entire component, which costs more than the scan ever could.
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
