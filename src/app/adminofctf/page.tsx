import type { Metadata } from "next";
import { loadAdminState } from "@/lib/ctf/state";
import AdminConsole from "./AdminConsole";
import "../ctf/ctf.css";

/**
 * The organiser view: every team, every clock, every submission as it lands.
 *
 * Reached by knowing the path. That is a deliberate, and weak, guard — anybody
 * who sees this URL on a projector has it — so the page is built to be
 * survivable if it leaks: it shows no flags, no submitted answers, and offers
 * nothing that changes a team's score. The one destructive control on it,
 * Reset, makes you type the word.
 *
 * Rendered dynamically on every request; there is a live log on it and nothing
 * here is worth caching.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CTF control",
  // Not a security measure — it does not stop anyone reaching the page. It stops
  // the URL turning up in a search result months later, which is the realistic
  // way an unlisted path stops being unlisted.
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminOfCtfPage() {
  const initial = await loadAdminState();

  return (
    <main className="bru">
      <div className="bru-wrap">
        <header className="bru-header">
          <div>
            <p className="bru-kicker">Xplore&apos;26 · organisers only</p>
            <h1 className="bru-title">Control</h1>
          </div>
          <div className="bru-id">
            {initial.totals.teams} teams · {initial.totals.started} running ·{" "}
            {initial.totals.finished} finished
          </div>
        </header>

        <AdminConsole initial={initial} />
      </div>
    </main>
  );
}
