import { NextResponse } from "next/server";
import { signSession, sessionCookieOptions } from "@/lib/auth/session";
import { joinTeam } from "@/lib/ctf/join";

/**
 * POST /api/ctf/join — open join by team name.
 *
 * No pre-issued code: one link is the whole entry flow. The name is the only
 * input, and the unique index on `nameKey` is what makes two people typing the
 * same one in the same instant resolve to a single team.
 *
 * Joining stays open for the whole event. There is no shared start to be late
 * for — each team runs its own clock from its own Start — so a team arriving
 * twenty minutes in is simply a team with a shorter afternoon, not a team
 * playing an easier event.
 */
export async function POST(request: Request) {
  let name: unknown;
  try {
    ({ name } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const result = await joinTeam(name);
  if (!result.ok) {
    // 409 for the taken name specifically, so the form can highlight the field
    // rather than showing a generic failure.
    const taken = result.error.includes("taken");
    return NextResponse.json({ error: result.error }, { status: taken ? 409 : 400 });
  }

  const token = await signSession({
    sub: result.participantId,
    teamId: result.teamId,
    role: "participant",
  });

  const res = NextResponse.json({
    ok: true,
    teamId: result.teamId,
    teamName: result.teamName,
  });
  res.cookies.set({ ...sessionCookieOptions(), value: token });
  return res;
}
