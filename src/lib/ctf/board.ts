import { collections } from "@/lib/db/client";
import { sectionLayout } from "./content";
import { computeRun } from "./sections";

/**
 * The CTF standings.
 *
 * Points are a PLAIN SUM of the append-only score ledger. A flat award is fixed
 * at the instant the server accepts the solve, so a row in `score_events` never
 * becomes wrong and never needs recomputing from the solve distribution.
 *
 * What is derived is TIME: how long each team's run has taken, which comes from
 * their own start and their own solve times — the same arithmetic their page
 * runs, so the board and the team's own clock cannot disagree.
 *
 * Cost: four reads, REGARDLESS of team count. With 30 teams a per-team query
 * loop would be 120 round trips where 4 will do, and it would be the slowest
 * thing in the event.
 */

export interface StandingsRow {
  teamId: string;
  teamName: string;
  points: number;
  solved: number;
  startedAt: Date | null;
  /** Frozen at the finish, still running otherwise. Null before Start. */
  elapsedMs: number | null;
  finished: boolean;
  finishedAt: Date | null;
  lastSolveAt: Date | null;
}

/**
 * Rank the field.
 *
 * Points first. Ties break on the SHORTER elapsed time — the run measured from
 * each team's own Start, so a team that began late is judged on how long they
 * took rather than on when they happened to sit down. A team that has not
 * started yet has no time to compare and sorts last within its score.
 *
 * Pure, so the ordering can be argued about against fixtures rather than
 * against a live database at 3pm on event day.
 */
export function rankStandings(rows: StandingsRow[]): StandingsRow[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    const at = a.elapsedMs ?? Infinity;
    const bt = b.elapsedMs ?? Infinity;
    if (at !== bt) return at - bt;

    // Nothing left that is about merit; sort by name so the board is stable
    // between polls rather than shuffling teams who are genuinely level.
    return a.teamName.localeCompare(b.teamName);
  });
}

export async function computeCtfStandings(now: Date = new Date()): Promise<StandingsRow[]> {
  const [teams, scores, subs, challengeDocs] = await Promise.all([
    collections.teams(),
    collections.scoreEvents(),
    collections.submissions(),
    collections.challenges(),
  ]);

  const [teamDocs, points, solveDocs, challenges] = await Promise.all([
    // Every team that has joined — NOT only those that have scored. A team on
    // zero belongs on the board from the moment they join; an empty scoreboard
    // during the first ten minutes reads as "the event is broken".
    teams
      .find({})
      .project<{ _id: unknown; name: string; startedAt?: Date | null }>({ name: 1, startedAt: 1 })
      .toArray(),

    scores
      .aggregate<{ _id: unknown; points: number; lastScoreAt: Date }>([
        { $match: { event: "ctf" } },
        { $group: { _id: "$teamId", points: { $sum: "$points" }, lastScoreAt: { $max: "$at" } } },
      ])
      .toArray(),

    // Grouped by (team, challenge) first so a duplicate correct submission
    // cannot count twice.
    subs
      .aggregate<{ _id: { teamId: unknown; challengeId: unknown }; at: Date }>([
        { $match: { type: "ctf", "verdict.correct": true } },
        { $group: { _id: { teamId: "$teamId", challengeId: "$challengeId" }, at: { $min: "$receivedAt" } } },
      ])
      .toArray(),

    challengeDocs.find({ type: "ctf" }).project<{ _id: unknown; slug: string }>({ slug: 1 }).toArray(),
  ]);

  const slugById = new Map(challenges.map((c) => [String(c._id), c.slug]));

  // teamId → (slug → first correct submission time)
  const solvesByTeam = new Map<string, Map<string, Date>>();
  for (const doc of solveDocs) {
    const slug = slugById.get(String(doc._id.challengeId));
    if (!slug) continue; // a solve against a challenge that has since been reseeded
    const teamId = String(doc._id.teamId);
    const forTeam = solvesByTeam.get(teamId) ?? new Map<string, Date>();
    forTeam.set(slug, doc.at);
    solvesByTeam.set(teamId, forTeam);
  }

  const pointsByTeam = new Map(
    points.map((p) => [String(p._id), { points: p.points, lastScoreAt: p.lastScoreAt ?? null }])
  );

  const layout = sectionLayout();

  const rows: StandingsRow[] = teamDocs.map((team) => {
    const teamId = String(team._id);
    const scored = pointsByTeam.get(teamId);
    const startedAt = team.startedAt ?? null;

    const run = computeRun({ startedAt, layout, solvedAt: solvesByTeam.get(teamId) ?? new Map(), now });

    return {
      teamId,
      teamName: team.name,
      points: scored?.points ?? 0,
      solved: run.totalSolved,
      startedAt,
      elapsedMs: run.started ? run.elapsedMs : null,
      finished: run.finished,
      finishedAt: run.finishedAt,
      lastSolveAt: scored?.lastScoreAt ?? null,
    };
  });

  return rankStandings(rows);
}
