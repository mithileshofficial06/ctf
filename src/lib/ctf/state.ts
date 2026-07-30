import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { computeCtfStandings } from "./board";
import { sectionLayout } from "./content";
import { teamSolveTimes } from "./run";
import { computeRun } from "./sections";
import { toPublicRun, type CtfStatePayload } from "./state-view";

/**
 * Assemble everything the CTF page needs, in ONE payload.
 *
 * The team's own run and the standings ship together deliberately. Fetched
 * separately they can disagree for a poll interval — a team seeing eight solves
 * on their own card while the scoreboard still credits them with seven is the
 * kind of thing that starts an argument in front of an audience.
 *
 * `serverNow` is in here for the same reason. Durations are computed here, on
 * the server clock, so a laptop that is five minutes fast still shows the right
 * elapsed time; the client only ticks between polls.
 *
 * Question TEXT is deliberately absent — it is static and public, so the client
 * has it from `content.ts` already. Sending it on every five-second poll would
 * be several kilobytes of unchanging prose per team per tick.
 */
export async function loadCtfState(teamId: string | null): Promise<CtfStatePayload> {
  const now = new Date();
  const standings = await computeCtfStandings(now);

  let team: CtfStatePayload["team"] = null;
  let run: CtfStatePayload["run"] = null;

  if (teamId) {
    const row = standings.find((r) => r.teamId === teamId);

    if (row) {
      team = { teamId, teamName: row.teamName };

      const solvedAt = await teamSolveTimes(new ObjectId(teamId));
      run = toPublicRun(
        computeRun({ startedAt: row.startedAt, layout: sectionLayout(), solvedAt, now })
      );
    }
  }

  return {
    serverNow: now.toISOString(),
    team,
    run,
    standings: standings.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      points: r.points,
      solved: r.solved,
      elapsedMs: r.elapsedMs,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      finished: r.finished,
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      lastSolveAt: r.lastSolveAt ? r.lastSolveAt.toISOString() : null,
    })),
    teamCount: standings.length,
  };
}

/**
 * The organiser view: every team, and every submission as it lands.
 *
 * Deliberately a separate loader from the participant one. It reads the raw
 * submission log rather than the derived board, because what an organiser needs
 * to answer — "did that team's flag actually reach us, and when?" — is a
 * question about receipts, not about scores. Wrong answers are included for the
 * same reason: a team insisting they submitted something is settled by showing
 * them the row.
 */

export interface AdminSubmissionRow {
  submissionId: string;
  teamId: string;
  teamName: string;
  challengeSlug: string;
  challengeTitle: string;
  correct: boolean;
  points: number;
  /** ISO. Server clock, stamped when the request was accepted. */
  receivedAt: string;
}

export interface AdminTeamRow {
  teamId: string;
  teamName: string;
  joinedAt: string;
  startedAt: string | null;
  points: number;
  solved: number;
  totalQuestions: number;
  elapsedMs: number | null;
  finished: boolean;
  finishedAt: string | null;
  lastSubmissionAt: string | null;
}

export interface AdminPayload {
  serverNow: string;
  teams: AdminTeamRow[];
  submissions: AdminSubmissionRow[];
  totals: { teams: number; started: number; finished: number; submissions: number };
}

/** How many submissions the live feed carries. Enough to scroll, not to choke. */
const FEED_LIMIT = 200;

export async function loadAdminState(): Promise<AdminPayload> {
  const now = new Date();

  const [standings, teams, subs, challengeDocs] = await Promise.all([
    computeCtfStandings(now),
    collections.teams(),
    collections.submissions(),
    collections.challenges(),
  ]);

  const [teamDocs, recent, challenges, submissionCount] = await Promise.all([
    teams.find({}).project<{ _id: unknown; name: string; createdAt: Date }>({ name: 1, createdAt: 1 }).toArray(),

    subs
      .find({ type: "ctf" })
      .sort({ receivedAt: -1 })
      .limit(FEED_LIMIT)
      .toArray(),

    challengeDocs.find({ type: "ctf" }).project<{ _id: unknown; slug: string; title: string }>({ slug: 1, title: 1 }).toArray(),

    subs.countDocuments({ type: "ctf" }),
  ]);

  const challengeById = new Map(challenges.map((c) => [String(c._id), c]));
  const joinedById = new Map(teamDocs.map((t) => [String(t._id), new Date(t.createdAt)]));
  const nameById = new Map(teamDocs.map((t) => [String(t._id), t.name]));

  // Newest submission per team, for the "last seen" column. Taken from the feed
  // window rather than a second aggregation: a team whose most recent activity
  // has already scrolled off 200 submissions is not one anybody is chasing.
  const lastSubmissionByTeam = new Map<string, Date>();
  for (const s of recent) {
    const teamId = String(s.teamId);
    const at = new Date(s.receivedAt);
    const seen = lastSubmissionByTeam.get(teamId);
    if (!seen || at > seen) lastSubmissionByTeam.set(teamId, at);
  }

  const totalQuestions = sectionLayout().flat().length;

  const teamRows: AdminTeamRow[] = standings.map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    joinedAt: (joinedById.get(r.teamId) ?? now).toISOString(),
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    points: r.points,
    solved: r.solved,
    totalQuestions,
    elapsedMs: r.elapsedMs,
    finished: r.finished,
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    lastSubmissionAt: lastSubmissionByTeam.get(r.teamId)?.toISOString() ?? null,
  }));

  const submissionRows: AdminSubmissionRow[] = recent.map((s) => {
    const challenge = challengeById.get(String(s.challengeId));
    return {
      submissionId: String(s._id),
      teamId: String(s.teamId),
      teamName: nameById.get(String(s.teamId)) ?? "Unknown",
      challengeSlug: challenge?.slug ?? "unknown",
      challengeTitle: challenge?.title ?? "Unknown question",
      correct: s.verdict?.correct ?? false,
      points: s.verdict?.points ?? 0,
      receivedAt: new Date(s.receivedAt).toISOString(),
    };
  });

  return {
    serverNow: now.toISOString(),
    teams: teamRows,
    submissions: submissionRows,
    totals: {
      teams: teamRows.length,
      started: teamRows.filter((t) => t.startedAt !== null).length,
      finished: teamRows.filter((t) => t.finished).length,
      submissions: submissionCount,
    },
  };
}
