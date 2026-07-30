import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { startRun } from "@/lib/ctf/run";

/**
 * POST /api/ctf/start — start THIS team's clock.
 *
 * The team is taken from the session cookie, never from the request body. A
 * body-supplied team id would let anyone start — or, worse, be seen to start —
 * somebody else's run.
 *
 * Idempotent by construction: the underlying update only matches while
 * `startedAt` is unset, so a double-click returns the existing timestamp rather
 * than resetting the run to zero.
 */
export async function POST() {
  try {
    const session = await requireSession();
    const { started, startedAt } = await startRun(session.teamId);

    return NextResponse.json(
      {
        ok: true,
        // False means the clock was already running — not an error, but the UI
        // should not claim it just started anything.
        started,
        startedAt: startedAt ? startedAt.toISOString() : null,
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Join a team first" }, { status: 401 });
    }
    console.error("[ctf/start] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
