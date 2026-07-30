import { ObjectId } from "mongodb";
import { hashAnswer } from "@/lib/auth/session";
import { sectionLayout } from "@/lib/ctf/content";
import { readTeamStart, teamSolveTimes } from "@/lib/ctf/run";
import { computeRun, gateSubmission } from "@/lib/ctf/sections";
import type { GradeInput, GradeResult } from "./types";

/**
 * CTF — run gate, then hashed flag compare, then the section's flat rate.
 *
 * THE GATE RUNS BEFORE THE COMPARE, and that order matters. A team that has not
 * started must not be able to discover whether a flag is correct by watching
 * which error comes back, and a question already solved must not pay twice. The
 * board never draws a submit box in either case, so anything reaching here past
 * the gate came from curl or a stale tab — and it is refused with the reason,
 * not silently.
 *
 * Points are FIXED at this instant and never recomputed, so the ledger row stays
 * true and the leaderboard is a plain sum.
 */
export async function gradeCtf(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload, receivedAt } = input;

  // This team's start and their correct solves — the same inputs the board and
  // their own page use, so all three agree about where they stand.
  const [startedAt, solvedAt] = await Promise.all([
    readTeamStart(String(teamId)),
    teamSolveTimes(teamId as ObjectId),
  ]);

  const run = computeRun({
    startedAt,
    layout: sectionLayout(),
    solvedAt,
    now: receivedAt,
  });

  const gate = gateSubmission(run, challenge.slug);
  if (!gate.allowed) {
    return { correct: false, points: 0, meta: { reason: gate.reason, section: gate.section } };
  }

  if (hashAnswer(payload) !== challenge.config.answerHash) {
    return { correct: false, points: 0, meta: { section: gate.section.section } };
  }

  // One question short of the full set, and this is the one closing the gap.
  const clearsEvent = run.totalSolved + 1 === run.totalQuestions;

  return {
    correct: true,
    points: gate.section.points,
    meta: {
      section: gate.section.section,
      sectionName: gate.section.name,
      solved: run.totalSolved + 1,
      total: run.totalQuestions,
      // True when this solve completes the event — the UI turns it into "that's
      // all eight, your clock has stopped" rather than another "+200".
      clearsEvent,
    },
  };
}
