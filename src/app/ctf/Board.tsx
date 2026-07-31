"use client";

import type { CtfStatePayload } from "@/lib/ctf/state-view";
import { formatDuration } from "./CtfBoard";

/**
 * The live standings.
 *
 * Pure presentation: it renders out of the state its parent is already polling
 * rather than fetching its own. Two panels with two fetches can disagree for a
 * poll interval, and a team reading one score on their own card and another on
 * the board is how an argument starts.
 *
 * Ordering — points, then the SHORTER run — is decided server-side in
 * lib/ctf/board.ts and simply drawn here. The top three get a medal rank; rank
 * is shown as a number too, never colour alone.
 */
export default function Board({ state }: { state: CtfStatePayload }) {
  const rows = state.standings;
  const you = state.team?.teamId ?? null;

  return (
    <>
      <div className="bru-board-head">
        <h2 className="bru-h2">Leaderboard</h2>
        <span className="bru-live">
          <span className="bru-dot" aria-hidden="true" />
          Live
        </span>
      </div>

      <div className="bru-rows">
        {rows.length === 0 && <p className="bru-empty">Teams appear here as they join.</p>}

        {rows.map((row, i) => (
          <div key={row.teamId} className={`bru-row${row.teamId === you ? " bru-row-you" : ""}`}>
            <span className={`bru-rank${i < 3 ? ` bru-rank-${i + 1}` : ""}`}>{i + 1}</span>

            <div>
              <div className="bru-row-name">
                {row.teamName}
                {row.teamId === you && <span className="bru-you-tag">You</span>}
              </div>
              <div className="bru-row-sub">{describe(row)}</div>
            </div>

            <span className="bru-avatar" aria-hidden="true">
              {initials(row.teamName)}
            </span>
          </div>
        ))}
      </div>

      <p className="bru-row-sub" style={{ marginTop: 14 }}>
        {state.teamCount} team{state.teamCount === 1 ? "" : "s"} · ranked on points, then the
        shorter run
      </p>
    </>
  );
}

/** Up to two initials for the avatar disc. Falls back to a spider glyph. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "🕷";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The sub-line under a team's name: how far they are and how long it took.
 *
 * A RUNNING team's time is NOT ticked locally here — it advances when the poll
 * brings a fresh number. Thirty rows each animating their own second hand is
 * thirty re-renders a second for information nobody reads to the second, and
 * doing it would mean calling Date.now() during render, which is an impure read
 * that makes the server and client paints disagree.
 */
function describe(row: CtfStatePayload["standings"][number]): string {
  if (row.elapsedMs === null) return "Not started";

  const time = formatDuration(row.elapsedMs);
  return row.finished
    ? `Finished · ${time} · ${row.solved} solved`
    : `${row.points} pts · ${row.solved} solved`;
}
