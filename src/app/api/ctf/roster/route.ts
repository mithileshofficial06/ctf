import { NextResponse } from "next/server";
import { loadAdminState } from "@/lib/ctf/state";

/**
 * GET /api/ctf/roster — the organiser feed behind /adminofctf.
 *
 * Every team with its clock, plus the most recent submissions with the server
 * timestamp each one was accepted at.
 *
 * NOT SECRET-BEARING. It carries no flags and no submitted payloads — only who
 * submitted against which question, whether it was right, and when. That is
 * deliberate: the page it feeds is guarded by an obscure URL rather than a key,
 * so it must stay useless to anyone who guesses the path.
 */
export async function GET() {
  try {
    const payload = await loadAdminState();

    return NextResponse.json(payload, {
      // A live log. Never let a shared cache serve a stale one.
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (err) {
    console.error("[ctf/roster] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
