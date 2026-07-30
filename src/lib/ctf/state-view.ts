import type { SectionKey, TeamRun } from "./sections";

/**
 * The shapes that cross the wire.
 *
 * NOTE WHAT IS ABSENT: question text. Titles, explanations and payloads are
 * static, public, and identical for every team, so the client imports them
 * straight from `content.ts` and this payload carries only what actually
 * changes — who solved what, when, and where everyone stands.
 *
 * That is a deliberate simplification of the previous format, which had to
 * redact locked questions server-side because reaching one early was worth
 * something. Nothing is locked now, so there is nothing to redact, and a
 * redaction layer kept "just in case" is a layer that rots. The one secret in
 * this event is the flag itself, which lives in `content.server.ts` and is
 * never serialised anywhere — the seed proves it, and a lint rule stops a
 * component importing it.
 */

export interface PublicQuestion {
  slug: string;
  order: number;
  solved: boolean;
  /** ISO, null unless this team solved it. */
  solvedAt: string | null;
}

export interface PublicSection {
  section: SectionKey;
  name: string;
  /** Flat rate for every question in this section. */
  points: number;
  solvedCount: number;
  total: number;
  cleared: boolean;
  questions: PublicQuestion[];
}

export interface PublicRun {
  started: boolean;
  startedAt: string | null;
  sections: PublicSection[];
  totalSolved: number;
  totalQuestions: number;
  points: number;
  finished: boolean;
  finishedAt: string | null;
  /**
   * Milliseconds from this team's Start. Frozen once finished.
   *
   * Sent as a duration rather than left for the client to subtract, so a laptop
   * with a wrong clock still displays the right elapsed time. While the run is
   * live the client ticks this forward locally between polls.
   */
  elapsedMs: number;
}

/** A row on the live board. */
export interface StandingRow {
  teamId: string;
  teamName: string;
  points: number;
  solved: number;
  /** Frozen at the finish, still running otherwise. Null before Start. */
  elapsedMs: number | null;
  startedAt: string | null;
  finished: boolean;
  finishedAt: string | null;
  lastSolveAt: string | null;
}

/**
 * THE payload — everything the page needs, in one response.
 *
 * The team's own progress and the standings ship together deliberately. Two
 * panels fetched separately can disagree for a poll interval, and two boards
 * disagreeing in front of an audience is worse than either being a few seconds
 * stale.
 */
export interface CtfStatePayload {
  /** The server's clock. The anchor every duration on screen is measured from. */
  serverNow: string;
  team: { teamId: string; teamName: string } | null;
  run: PublicRun | null;
  standings: StandingRow[];
  teamCount: number;
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/** Pure: run → wire shape. Testable without a database. */
export function toPublicRun(run: TeamRun): PublicRun {
  return {
    started: run.started,
    startedAt: iso(run.startedAt),
    sections: run.sections.map((s) => ({
      section: s.section,
      name: s.name,
      points: s.points,
      solvedCount: s.solvedCount,
      total: s.total,
      cleared: s.cleared,
      questions: s.questions.map((q) => ({
        slug: q.slug,
        order: q.order,
        solved: q.solved,
        solvedAt: iso(q.solvedAt),
      })),
    })),
    totalSolved: run.totalSolved,
    totalQuestions: run.totalQuestions,
    points: run.points,
    finished: run.finished,
    finishedAt: iso(run.finishedAt),
    elapsedMs: run.elapsedMs,
  };
}
