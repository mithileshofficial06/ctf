/**
 * The format, in one pure function.
 *
 * Eight questions in three difficulty sections. Every question is open from the
 * moment a team presses Start — no unlock chain, no deadline, no elimination.
 * A team works whichever question it likes, in whatever order it likes.
 *
 * What IS per-team is the clock. Each team starts its own run, so a team that
 * joins ten minutes late is not ten minutes behind: their elapsed time is
 * measured from their own Start, which is what makes the ranking fair when
 * teams do not begin together.
 *
 * A team's run is DERIVED, never stored. Everything below is a function of
 * exactly three inputs:
 *
 *   1. when that team pressed Start
 *   2. that team's correct-solve timestamps (server clock, immutable)
 *   3. what time it is now
 *
 * So there is no progress document to fall out of step with the submissions
 * that produced it, and no background job to advance anybody. The page, the
 * scoreboard and the submission gate all call this and therefore cannot
 * disagree about where a team stands.
 */

export const SECTION_KEYS = [1, 2, 3] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** One difficulty band's fixed parameters. */
export interface SectionSpec {
  section: SectionKey;
  name: string;
  /** Awarded for ANY solve in this section, identical for every team. */
  points: number;
}

/**
 * Points are FLAT per difficulty. Every team sees the same number on the same
 * card for the whole event, so a card is worth what it says it is worth and a
 * scoring dispute is settled by reading this table rather than by trusting the
 * database.
 */
export const SECTIONS: SectionSpec[] = [
  { section: 1, name: "Easy", points: 100 },
  { section: 2, name: "Medium", points: 150 },
  { section: 3, name: "Hard", points: 200 },
];

export function sectionSpec(section: number, specs: SectionSpec[] = SECTIONS): SectionSpec | undefined {
  return specs.find((s) => s.section === section);
}

export interface QuestionRun {
  slug: string;
  /** 1-based position within its section. Presentation order only. */
  order: number;
  solved: boolean;
  solvedAt: Date | null;
}

export interface SectionRun {
  section: SectionKey;
  name: string;
  points: number;
  questions: QuestionRun[];
  solvedCount: number;
  total: number;
  /** Every question in this section is solved. */
  cleared: boolean;
}

export interface TeamRun {
  /** Has this team pressed Start? */
  started: boolean;
  startedAt: Date | null;
  sections: SectionRun[];
  totalSolved: number;
  totalQuestions: number;
  /** Sum of the flat rate for every solve. Matches the ledger by construction. */
  points: number;
  /** Every question in the event is solved. */
  finished: boolean;
  /** The last solve, once finished. This is what stops the clock. */
  finishedAt: Date | null;
  /**
   * Start → finish once finished, Start → now while running, 0 before Start.
   *
   * Freezing at the finish is the whole reason the ranking can separate two
   * teams on full marks: their elapsed time stops meaning "how long ago did
   * they start" and starts meaning "how long did they take".
   */
  elapsedMs: number;
}

export interface RunInput {
  /** Null until this team presses Start. */
  startedAt: Date | null;
  /**
   * Ordered slugs per section: `layout[0]` is Easy, in display order. Passed in
   * rather than imported so this stays a pure rule engine and the tests can
   * describe any shape of event.
   */
  layout: string[][];
  /** This team's correct solves, slug → server receipt time. */
  solvedAt: Map<string, Date>;
  now: Date;
  specs?: SectionSpec[];
}

/** Where a team stands. */
export function computeRun(input: RunInput): TeamRun {
  const { startedAt, layout, solvedAt, now } = input;
  const specs = input.specs ?? SECTIONS;

  const sections: SectionRun[] = [];
  let totalSolved = 0;
  let totalQuestions = 0;
  let points = 0;
  /** The latest solve anywhere in the run — the clock stops here once finished. */
  let lastSolveAt: Date | null = null;

  for (let i = 0; i < layout.length; i++) {
    const slugs = layout[i];
    const spec = specs[i] ?? { section: (i + 1) as SectionKey, name: `Section ${i + 1}`, points: 0 };

    const questions: QuestionRun[] = slugs.map((slug, index) => {
      // A solve recorded before this team started is not possible through the
      // gate, but the arithmetic must not reward it if one ever appears.
      const at = solvedAt.get(slug) ?? null;
      const counted = at !== null && startedAt !== null && at >= startedAt;
      return { slug, order: index + 1, solved: counted, solvedAt: counted ? at : null };
    });

    const solvedCount = questions.filter((q) => q.solved).length;

    for (const q of questions) {
      if (!q.solvedAt) continue;
      if (!lastSolveAt || q.solvedAt > lastSolveAt) lastSolveAt = q.solvedAt;
    }

    totalSolved += solvedCount;
    totalQuestions += questions.length;
    points += solvedCount * spec.points;

    sections.push({
      section: spec.section,
      name: spec.name,
      points: spec.points,
      questions,
      solvedCount,
      total: questions.length,
      cleared: questions.length > 0 && solvedCount === questions.length,
    });
  }

  const finished = totalQuestions > 0 && totalSolved === totalQuestions;
  const finishedAt = finished ? lastSolveAt : null;

  // Clamped at zero: a clock that runs backwards between two reads must not
  // produce a negative duration on a projected scoreboard.
  const elapsedMs = startedAt
    ? Math.max(0, (finishedAt ?? now).getTime() - startedAt.getTime())
    : 0;

  return {
    started: startedAt !== null,
    startedAt,
    sections,
    totalSolved,
    totalQuestions,
    points,
    finished,
    finishedAt,
    elapsedMs,
  };
}

/**
 * May this team submit an answer to this slug right now?
 *
 * Short, because the format has almost no gate left: there is no lock to pick
 * and no deadline to beat. What remains is worth keeping — a team that has not
 * started has no clock to measure a solve against, and a re-submission of an
 * already-correct flag must not score twice.
 *
 * The board never draws a submit box in either case, so anything reaching here
 * came from curl or a stale tab, and it is refused with the reason rather than
 * silently.
 */
export type GateReason = "not-started" | "unknown-question" | "already-solved";

export type SubmitGate =
  | { allowed: true; section: SectionSpec; question: QuestionRun }
  | { allowed: false; reason: GateReason; section: number | null };

export function gateSubmission(run: TeamRun, slug: string): SubmitGate {
  const section = run.sections.find((s) => s.questions.some((q) => q.slug === slug));
  if (!section) return { allowed: false, reason: "unknown-question", section: null };

  const question = section.questions.find((q) => q.slug === slug)!;

  if (!run.started) return { allowed: false, reason: "not-started", section: section.section };
  if (question.solved) return { allowed: false, reason: "already-solved", section: section.section };

  return {
    allowed: true,
    section: { section: section.section, name: section.name, points: section.points },
    question,
  };
}
