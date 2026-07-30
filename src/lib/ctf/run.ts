import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";

/**
 * Starting a run, and reading the solve times a run is derived from.
 *
 * There is no global event phase any more: a team starts its own clock when it
 * is ready. That makes Start the only piece of CTF state that is a DECISION
 * rather than a derivation, and it is written exactly once per team.
 */

export interface StartResult {
  started: boolean;
  startedAt: Date | null;
}

/**
 * Start this team's clock.
 *
 * Conditional on `startedAt` still being unset, so a double-click — or the same
 * team open on two laptops — cannot restart the run and hand them a fresh zero.
 * Exactly one caller sees `started: true`; everyone else gets the timestamp
 * that is already there.
 *
 * The `$in: [null, ...]` match covers documents written before the field
 * existed, where it is absent rather than null. `{ startedAt: null }` alone
 * matches both in MongoDB, but being explicit costs nothing and survives
 * someone tightening the query later.
 */
export async function startRun(teamId: string): Promise<StartResult> {
  const teams = await collections.teams();
  const _id = new ObjectId(teamId);
  const now = new Date();

  const result = await withThrottleRetry(() =>
    teams.updateOne(
      { _id, $or: [{ startedAt: null }, { startedAt: { $exists: false } }] },
      { $set: { startedAt: now } }
    )
  );

  if (result.modifiedCount === 1) return { started: true, startedAt: now };

  // Already running — report the real start time rather than the one we just
  // failed to write, so the client's clock matches the server's arithmetic.
  const existing = await teams.findOne({ _id }, { projection: { startedAt: 1 } });
  return { started: false, startedAt: existing?.startedAt ?? null };
}

export async function readTeamStart(teamId: string): Promise<Date | null> {
  const teams = await collections.teams();
  const team = await teams.findOne({ _id: new ObjectId(teamId) }, { projection: { startedAt: 1 } });
  return team?.startedAt ?? null;
}

/**
 * slug → first correct submission time, for one team.
 *
 * Grouped by challenge with `$min` so a duplicate correct submission — which
 * the gate should prevent, but which a race could still slip through — cannot
 * move a team's finish time later than the solve that actually earned it.
 */
export async function teamSolveTimes(teamId: ObjectId): Promise<Map<string, Date>> {
  const [subs, challenges] = await Promise.all([
    collections.submissions(),
    collections.challenges(),
  ]);

  const solves = await subs
    .aggregate<{ _id: unknown; at: Date }>([
      { $match: { type: "ctf", teamId, "verdict.correct": true } },
      { $group: { _id: "$challengeId", at: { $min: "$receivedAt" } } },
    ])
    .toArray();

  if (solves.length === 0) return new Map();

  const docs = await challenges
    .find({ type: "ctf" })
    .project<{ _id: unknown; slug: string }>({ slug: 1 })
    .toArray();
  const slugById = new Map(docs.map((d) => [String(d._id), d.slug]));

  const result = new Map<string, Date>();
  for (const solve of solves) {
    const slug = slugById.get(String(solve._id));
    if (slug) result.set(slug, solve.at);
  }
  return result;
}

/**
 * Wipe the event back to empty: teams, solves, scores, the board.
 *
 * Exists so the format can be rehearsed more than once. Genuinely destructive
 * and with no undo, which is why the admin page makes you type the word.
 *
 * Challenges are NOT touched: they are seeded content, not event data.
 */
export async function resetEvent(): Promise<void> {
  const [subs, scores, boards, teams, participants, codes] = await Promise.all([
    collections.submissions(),
    collections.scoreEvents(),
    collections.leaderboards(),
    collections.teams(),
    collections.participants(),
    collections.accessCodes(),
  ]);

  await Promise.all([
    subs.deleteMany({ type: "ctf" }),
    scores.deleteMany({ event: "ctf" }),
    boards.deleteMany({ event: { $in: ["ctf", "overall"] } }),
    // Teams are created by joining this event, so a reset clears the roster too
    // — otherwise every name from the rehearsal stays taken.
    teams.deleteMany({}),
    participants.deleteMany({}),
    codes.deleteMany({}),
  ]);
}
