import { collections } from "@/lib/db/client";
import { EVENTS, LEADERBOARD_REFRESH_MS, type EventKey } from "@/lib/config";
import { computeCtfStandings } from "@/lib/ctf/board";
import type { LeaderboardSnapshot } from "@/lib/db/types";

/**
 * Leaderboard materializer.
 *
 * Aggregating the ledger per request would mean ~100 aggregations/sec with 500
 * clients polling every 5s. Instead we aggregate ONCE every few seconds into a
 * snapshot document and serve that, so polling cost is independent of how many
 * people are watching — roughly 0.2 DB reads/sec total.
 *
 * Ties break on the EARLIER last-score time: the team that got there first
 * ranks higher. That's the same server-clock fairness the pipeline stamps.
 *
 * Every event now sums the same immutable ledger. CTF used to be the exception
 * — decay meant a stored total went wrong as soon as somebody else solved — but
 * a flat award is fixed at the instant the server accepts the solve, so its
 * rows stay true like everyone else's. What CTF still adds on top is its RUN:
 * how many questions a team has solved and how long they took, derived from
 * their own start and solve times rather than summed.
 */

const MAX_ROWS = 200;

type Row = LeaderboardSnapshot["rows"][number];

/** OVERALL-BOARD DECISION — recorded here deliberately, per the architecture.
 *
 * `overall` sums score_events across ALL events, CTF included. Under the old
 * decay scoring it could not: a CTF row carried the value at solve time, which
 * decay had since moved, so summing it would drift from the CTF board and the
 * two would disagree in front of an audience. Flat points removed that problem
 * at the source — a CTF row is worth what it says forever — so the special case
 * came out rather than being maintained for a rule that no longer exists.
 */
export async function materialize(event: EventKey | "overall"): Promise<LeaderboardSnapshot> {
  const rows =
    event === "ctf"
      ? await ctfRows()
      : event === "overall"
        ? await ledgerRows()
        : await ledgerRows(event);

  const snapshot: LeaderboardSnapshot = {
    event,
    generatedAt: new Date(),
    rows: rows.slice(0, MAX_ROWS),
  };

  const boards = await collections.leaderboards();
  await boards.updateOne({ event }, { $set: snapshot }, { upsert: true });
  return snapshot;
}

/**
 * Sum the append-only ledger.
 *
 * How hunt, quiz and code score, and — with `event` omitted — how `overall`
 * scores too, since every event's rows are now immutable once written.
 */
async function ledgerRows(event?: EventKey): Promise<Row[]> {
  const scores = await collections.scoreEvents();

  const aggregated = await scores
    .aggregate<{ _id: unknown; points: number; lastScoreAt: Date }>([
      ...(event ? [{ $match: { event } }] : []),
      { $group: { _id: "$teamId", points: { $sum: "$points" }, lastScoreAt: { $max: "$at" } } },
      { $sort: { points: -1, lastScoreAt: 1 } },
      { $limit: MAX_ROWS },
    ])
    .toArray();

  return withNames(
    aggregated.map((r) => ({
      teamId: String(r._id),
      points: r.points,
      lastScoreAt: r.lastScoreAt ?? null,
    }))
  );
}

/**
 * CTF sums the same ledger, but carries its run with it.
 *
 * `computeCtfStandings` has already ranked the field — points, then the shorter
 * run — and knows every team's name, so this is a straight projection: no
 * second name lookup, and no chance of the snapshot ordering the field
 * differently from the live board on the CTF page.
 */
async function ctfRows(): Promise<Row[]> {
  const standings = await computeCtfStandings();

  return standings.map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    points: r.points,
    lastScoreAt: r.lastSolveAt,
    solved: r.solved,
    elapsedMs: r.elapsedMs,
    finished: r.finished,
  }));
}

/** One lookup for the names rather than a $lookup per row. */
async function withNames(
  rows: Array<{ teamId: string; points: number; lastScoreAt: Date | null }>
): Promise<Row[]> {
  const teams = await collections.teams();
  const teamDocs = await teams.find({}).project<{ _id: unknown; name: string }>({ name: 1 }).toArray();
  const names = new Map(teamDocs.map((t) => [String(t._id), t.name]));

  return rows.map((r) => ({
    teamId: r.teamId,
    teamName: names.get(r.teamId) ?? "Unknown",
    points: r.points,
    lastScoreAt: r.lastScoreAt,
  }));
}

/** Refresh every board. Called on a timer or by an admin endpoint. */
export async function materializeAll(): Promise<void> {
  await Promise.all([...EVENTS, "overall" as const].map((e) => materialize(e)));
}

/**
 * In-flight recomputes, one slot per event.
 *
 * Without this, a burst of pollers that all find the snapshot stale would all
 * recompute it simultaneously — the exact stampede the snapshot exists to
 * prevent. The first caller does the work; everyone else awaits its promise.
 */
const inFlight = new Map<string, Promise<LeaderboardSnapshot>>();

function refresh(event: EventKey | "overall"): Promise<LeaderboardSnapshot> {
  const existing = inFlight.get(event);
  if (existing) return existing;

  const run = materialize(event).finally(() => inFlight.delete(event));
  inFlight.set(event, run);
  return run;
}

/**
 * Read the current snapshot, recomputing it when it has gone stale.
 *
 * This is what makes the board LIVE. `existing ?? materialize()` was not
 * enough: it only ever computed the snapshot once, so after the first read the
 * standings froze for the rest of the event while every poll happily returned
 * a stale document. Nothing schedules materializeAll(), so the refresh has to
 * be driven by reads.
 *
 * Cost stays independent of how many people are watching, which is the whole
 * point of the materializer: one recompute per refresh interval per replica,
 * whether that interval had one poller or five hundred.
 *
 * A recompute that fails serves the stale snapshot rather than erroring — a
 * slightly old scoreboard beats a broken one in front of an audience.
 */
export async function readSnapshot(event: EventKey | "overall"): Promise<LeaderboardSnapshot> {
  const boards = await collections.leaderboards();
  const existing = await boards.findOne({ event });

  if (!existing) return refresh(event);

  const age = Date.now() - new Date(existing.generatedAt).getTime();
  if (age < LEADERBOARD_REFRESH_MS) return existing;

  try {
    return await refresh(event);
  } catch (err) {
    console.error(`[leaderboard] recompute failed for "${event}", serving stale`, err);
    return existing;
  }
}
