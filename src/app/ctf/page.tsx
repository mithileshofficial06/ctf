import { getSession } from "@/lib/auth/guard";
import { loadCtfState } from "@/lib/ctf/state";
import CtfBoard from "./CtfBoard";
import "./ctf.css";

/**
 * CTF — the entire event at one URL.
 *
 * No login wall: a visitor with no session sees the join form, and the same
 * page becomes the start screen and then the board as that team's own state
 * changes underneath them. That is the point of the single link — nobody is
 * ever told to go somewhere else.
 *
 * Rendered dynamically on every request because it carries a live clock and
 * per-team progress; there is nothing here worth caching.
 */
export const dynamic = "force-dynamic";

export default async function CtfPage() {
  const session = await getSession();

  // Server-rendered first paint, so the board is on screen before hydration —
  // no spinner on a projector.
  const initial = await loadCtfState(session?.teamId ?? null);

  return (
    <main className="bru">
      <div className="bru-wrap">
        <header className="bru-header">
          <div>
            <p className="bru-kicker">Xplore&apos;26 · LICET</p>
            <h1 className="bru-title">
              Capture
              <br />
              the Flag
            </h1>
          </div>
          <div className="bru-id">
            {initial.team ? (
              <>
                Team {initial.team.teamName}
                <br />8 questions · 100 / 150 / 200 pts
              </>
            ) : (
              <>
                8 questions · easy, medium, hard
                <br />
                Your own clock, no deadline
              </>
            )}
          </div>
        </header>

        <CtfBoard initial={initial} />
      </div>
    </main>
  );
}
