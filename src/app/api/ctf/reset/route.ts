import { NextResponse } from "next/server";
import { resetEvent } from "@/lib/ctf/run";

/**
 * POST /api/ctf/reset — wipe the event back to empty for another rehearsal.
 *
 * The single genuinely destructive operation in the platform: every team, every
 * submission, every score. There is no undo.
 *
 * It demands an explicit confirmation string rather than relying on the button
 * that calls it, because a button is a UI detail and this endpoint is reachable
 * with curl. Seeded challenges are not touched.
 */
export async function POST(request: Request) {
  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  if (body.confirm !== "RESET") {
    return NextResponse.json({ error: 'Reset requires confirm: "RESET"' }, { status: 400 });
  }

  await resetEvent();
  return NextResponse.json({ ok: true });
}
