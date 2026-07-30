"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { AdminPayload, AdminSubmissionRow, AdminTeamRow } from "@/lib/ctf/state";
import { formatDuration } from "../ctf/CtfBoard";

/**
 * The live organiser console.
 *
 * Polls faster than the participant board (2s rather than 5s) because this is
 * the screen someone stares at when a team says "we definitely submitted that"
 * — the answer needs to appear while they are still standing there. It is one
 * or two viewers, not thirty, so the extra rate costs nothing.
 *
 * Timestamps are rendered CLIENT-SIDE ONLY. `toLocaleTimeString` resolves
 * against the viewer's locale and timezone, so rendering it on the server would
 * produce different text than the browser and break hydration. Everything
 * time-formatted here waits for mount.
 */

const POLL_MS = 2_000;

/**
 * "Are we running in the browser yet?"
 *
 * useSyncExternalStore is the right tool: the server snapshot is false and the
 * client snapshot is true, so the first client render matches the HTML exactly
 * and the switch happens during hydration. The setState-in-an-effect version of
 * this pattern causes a cascading render and React's lint rules reject it.
 *
 * The store never actually changes, so the subscribe function has nothing to
 * do — it exists only to satisfy the signature.
 */
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

export default function AdminConsole({ initial }: { initial: AdminPayload }) {
  const [data, setData] = useState<AdminPayload>(initial);
  const mounted = useSyncExternalStore(neverChanges, onClient, onServer);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ctf/roster", { cache: "no-store" });
      if (!res.ok) return;
      setData((await res.json()) as AdminPayload);
    } catch {
      // A dropped poll is normal; the next tick recovers.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <>
      <div className="bru-strip">
        <div className="bru-stat">
          <span className="bru-stat-label">Teams</span>
          <span className="bru-stat-value">{data.totals.teams}</span>
        </div>
        <div className="bru-stat bru-stat-clock">
          <span className="bru-stat-label">Running</span>
          <span className="bru-stat-value">{data.totals.started}</span>
        </div>
        <div className="bru-stat bru-stat-done">
          <span className="bru-stat-label">Finished</span>
          <span className="bru-stat-value">{data.totals.finished}</span>
        </div>
        <div className="bru-stat">
          <span className="bru-stat-label">Submissions</span>
          <span className="bru-stat-value">{data.totals.submissions}</span>
        </div>
      </div>

      <div className="bru-admin-grid">
        <section>
          <h2 className="bru-h2" style={{ marginBottom: 16 }}>
            Teams
          </h2>
          <TeamTable teams={data.teams} mounted={mounted} />
        </section>

        <section>
          <h2 className="bru-h2" style={{ marginBottom: 16 }}>
            Submissions{" "}
            <span className="bru-live">
              <span className="bru-dot" aria-hidden="true" />
              Live
            </span>
          </h2>
          <SubmissionTable rows={data.submissions} mounted={mounted} />
        </section>
      </div>

      <DangerZone onDone={refresh} />
    </>
  );
}

function TeamTable({ teams, mounted }: { teams: AdminTeamRow[]; mounted: boolean }) {
  if (teams.length === 0) {
    return (
      <div className="bru-box">
        <p className="bru-empty">No teams have joined yet.</p>
      </div>
    );
  }

  return (
    <div className="bru-tablewrap">
      <table className="bru-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Team</th>
            <th scope="col">Status</th>
            <th scope="col">Started</th>
            <th scope="col">Elapsed</th>
            <th scope="col">Solved</th>
            <th scope="col">Points</th>
            <th scope="col">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.teamId}>
              <td className="bru-num">{i + 1}</td>
              <td>{t.teamName}</td>
              <td>
                {/* Words, not colour alone — the pill says what it means. */}
                {t.finished ? (
                  <span className="bru-pill bru-pill-yes">Finished</span>
                ) : t.startedAt ? (
                  <span className="bru-pill">Running</span>
                ) : (
                  <span className="bru-pill bru-pill-idle">Not started</span>
                )}
              </td>
              <td className="bru-num">{mounted ? clock(t.startedAt) : "—"}</td>
              <td className="bru-num">{t.elapsedMs === null ? "—" : formatDuration(t.elapsedMs)}</td>
              <td className="bru-num">
                {t.solved}/{t.totalQuestions}
              </td>
              <td className="bru-num">{t.points}</td>
              <td className="bru-num">{mounted ? clock(t.lastSubmissionAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubmissionTable({ rows, mounted }: { rows: AdminSubmissionRow[]; mounted: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="bru-box">
        <p className="bru-empty">Nothing submitted yet.</p>
      </div>
    );
  }

  return (
    <div className="bru-tablewrap">
      <table className="bru-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Team</th>
            <th scope="col">Question</th>
            <th scope="col">Result</th>
            <th scope="col">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.submissionId}>
              <td className="bru-num">{mounted ? clock(s.receivedAt, true) : "—"}</td>
              <td>{s.teamName}</td>
              <td>{s.challengeTitle}</td>
              <td>
                <span className={`bru-pill ${s.correct ? "bru-pill-yes" : "bru-pill-no"}`}>
                  {s.correct ? "Correct" : "Wrong"}
                </span>
              </td>
              <td className="bru-num">{s.points || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Wipe the event.
 *
 * Behind its own confirmation because this page has no key on it: a misdirected
 * click during a live event would delete the whole thing with no undo. Typing
 * the word is the guard, and the endpoint demands it again server-side so the
 * button is not the only thing standing between a curl and the database.
 */
function DangerZone({ onDone }: { onDone: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ctf/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: body.error ?? "That didn't work" });
        return;
      }
      setConfirm("");
      setMessage({ ok: true, text: "Wiped. Every team, submission and score is gone." });
      onDone();
    } catch {
      setMessage({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bru-box" style={{ marginTop: 32 }}>
      <h2 className="bru-h2">Reset</h2>
      <p style={{ marginTop: 10 }}>
        Deletes every team, submission and score so the event can be rehearsed
        again. Seeded questions are kept. There is no undo — type{" "}
        <strong>RESET</strong> to enable it.
      </p>

      <form className="bru-form" onSubmit={reset}>
        <input
          className="bru-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="TYPE RESET"
          aria-label="Type RESET to confirm"
          autoComplete="off"
        />
        <button
          className="bru-btn bru-btn-danger"
          type="submit"
          disabled={busy || confirm !== "RESET"}
        >
          {busy ? "..." : "Wipe event"}
        </button>
      </form>

      {message && (
        <p
          className={`bru-verdict ${message.ok ? "bru-verdict-good" : "bru-verdict-bad"}`}
          role="status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** Local wall-clock time. Client-only — see the note at the top of the file. */
function clock(iso: string | null, withSeconds = false): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}
