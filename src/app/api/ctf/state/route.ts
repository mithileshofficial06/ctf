import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guard";
import { loadCtfState } from "@/lib/ctf/state";

/**
 * GET /api/ctf/state — the whole page, in one poll.
 *
 * Deliberately readable WITHOUT a session: the lobby and the standings are a
 * spectator view, and a projector in the hall should not need to join a team to
 * show the board. A caller with no session simply gets `team: null` and no
 * progress, so nothing team-specific leaks.
 *
 * Locked questions are redacted server-side by `toPublicProgress` — no title,
 * no prompt, no payload. The blur on the card is decoration; this is the lock.
 */
export async function GET() {
  try {
    const session = await getSession();
    const state = await loadCtfState(session?.teamId ?? null);

    return NextResponse.json(state, {
      // Per-team data, and a clock. Never let a shared cache serve one team's
      // progress to another, or a stale countdown to anyone.
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (err) {
    console.error("[ctf/state] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
