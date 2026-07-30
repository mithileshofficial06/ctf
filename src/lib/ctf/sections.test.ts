import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRun, gateSubmission, SECTIONS, type SectionSpec } from "./sections";

/**
 * The format's rules, argued against fixtures rather than against a live
 * database at 3pm on event day.
 */

const START = new Date("2026-08-01T10:00:00.000Z");
const LAYOUT = [
  ["e1", "e2", "e3"],
  ["m1", "m2", "m3"],
  ["h1", "h2"],
];

/** Minutes after START. */
function at(minutes: number): Date {
  return new Date(START.getTime() + minutes * 60_000);
}

function run(
  solved: Array<[string, number]>,
  nowMinutes: number,
  startedAt: Date | null = START,
  specs: SectionSpec[] = SECTIONS
) {
  return computeRun({
    startedAt,
    layout: LAYOUT,
    solvedAt: new Map(solved.map(([slug, m]) => [slug, at(m)])),
    now: at(nowMinutes),
    specs,
  });
}

test("before Start nothing counts and the clock reads zero", () => {
  const r = run([["e1", 5]], 10, null);

  assert.equal(r.started, false);
  assert.equal(r.totalSolved, 0);
  assert.equal(r.points, 0);
  assert.equal(r.elapsedMs, 0);
});

test("every question is available from the moment a team starts — there is no unlock chain", () => {
  const r = run([], 0);

  assert.deepEqual(r.sections.map((s) => s.total), [3, 3, 2]);
  assert.equal(r.totalQuestions, 8);
  assert.equal(r.totalSolved, 0);
});

test("questions may be solved in any order, including a hard one first", () => {
  const r = run([["h2", 3]], 4);

  assert.equal(r.totalSolved, 1);
  assert.equal(r.points, 200);
  assert.equal(r.sections[2].solvedCount, 1);
  assert.equal(r.sections[2].questions[1].solved, true);
});

test("each section pays its own flat rate", () => {
  const r = run([["e1", 1], ["m1", 2], ["h1", 3]], 4);

  assert.equal(r.points, 100 + 150 + 200);
});

test("a full clear of every section scores the maximum", () => {
  const all: Array<[string, number]> = LAYOUT.flat().map((slug, i) => [slug, i + 1]);
  const r = run(all, 20);

  // 3×100 + 3×150 + 2×200
  assert.equal(r.points, 1150);
  assert.equal(r.totalSolved, 8);
  assert.equal(r.finished, true);
});

test("the clock runs from THIS team's start, not from any shared one", () => {
  const r = run([], 12);
  assert.equal(r.elapsedMs, 12 * 60_000);
});

test("the clock STOPS at the last solve once everything is done", () => {
  // Finishes at minute 41; the board is still being watched at minute 90.
  const all: Array<[string, number]> = LAYOUT.flat().map((slug, i) => [slug, i + 1]);
  all[all.length - 1] = ["h2", 41];

  const r = run(all, 90);

  assert.equal(r.finished, true);
  assert.deepEqual(r.finishedAt, at(41));
  assert.equal(r.elapsedMs, 41 * 60_000, "elapsed must freeze at the finish, not keep counting");
});

test("the finish time is the LAST solve, whichever section it was in", () => {
  // The hard section was cleared early and an easy question finished the run.
  const solves: Array<[string, number]> = [
    ["h1", 5], ["h2", 6], ["m1", 7], ["m2", 8], ["m3", 9], ["e1", 10], ["e2", 11], ["e3", 30],
  ];
  const r = run(solves, 60);

  assert.deepEqual(r.finishedAt, at(30));
  assert.equal(r.elapsedMs, 30 * 60_000);
});

test("an unfinished run keeps ticking", () => {
  const r = run([["e1", 2], ["e2", 4]], 25);

  assert.equal(r.finished, false);
  assert.equal(r.finishedAt, null);
  assert.equal(r.elapsedMs, 25 * 60_000);
});

test("elapsed never goes negative if the clock jumps backwards between reads", () => {
  const r = computeRun({
    startedAt: at(10),
    layout: LAYOUT,
    solvedAt: new Map(),
    now: at(4),
    specs: SECTIONS,
  });
  assert.equal(r.elapsedMs, 0);
});

test("a solve stamped before the team started is not counted", () => {
  // Cannot happen through the gate; the arithmetic must not reward it anyway.
  const r = run([["e1", -5]], 10);

  assert.equal(r.totalSolved, 0);
  assert.equal(r.points, 0);
});

test("a section reports cleared only when all of its questions are solved", () => {
  const r = run([["e1", 1], ["e2", 2]], 5);
  assert.equal(r.sections[0].cleared, false);

  const done = run([["e1", 1], ["e2", 2], ["e3", 3]], 5);
  assert.equal(done.sections[0].cleared, true);
  assert.equal(done.finished, false, "one section is not the whole event");
});

test("solvedAt is carried through so the admin feed can show it", () => {
  const r = run([["m2", 7]], 9);
  assert.deepEqual(r.sections[1].questions[1].solvedAt, at(7));
});

/* ── The gate ────────────────────────────────────────────────────────────── */

test("the gate refuses a team that has not pressed Start", () => {
  const gate = gateSubmission(run([], 5, null), "e1");

  assert.equal(gate.allowed, false);
  if (!gate.allowed) assert.equal(gate.reason, "not-started");
});

test("the gate allows any unsolved question in any section", () => {
  const r = run([], 5);

  for (const slug of LAYOUT.flat()) {
    assert.equal(gateSubmission(r, slug).allowed, true, `${slug} should be open`);
  }
});

test("the gate refuses a question the team has already solved", () => {
  const gate = gateSubmission(run([["m1", 3]], 5), "m1");

  assert.equal(gate.allowed, false);
  if (!gate.allowed) {
    assert.equal(gate.reason, "already-solved");
    assert.equal(gate.section, 2);
  }
});

test("the gate refuses a slug that is not in the event", () => {
  const gate = gateSubmission(run([], 5), "not-a-question");

  assert.equal(gate.allowed, false);
  if (!gate.allowed) {
    assert.equal(gate.reason, "unknown-question");
    assert.equal(gate.section, null);
  }
});

test("the gate reports the section's rate, which is what the award is paid at", () => {
  const gate = gateSubmission(run([], 5), "h1");

  assert.equal(gate.allowed, true);
  if (gate.allowed) {
    assert.equal(gate.section.points, 200);
    assert.equal(gate.section.name, "Hard");
  }
});

test("a finished team is refused every question, because all of them are solved", () => {
  const all: Array<[string, number]> = LAYOUT.flat().map((slug, i) => [slug, i + 1]);
  const r = run(all, 60);

  for (const slug of LAYOUT.flat()) {
    const gate = gateSubmission(r, slug);
    assert.equal(gate.allowed, false);
    if (!gate.allowed) assert.equal(gate.reason, "already-solved");
  }
});

test("the published rates are 100 / 150 / 200", () => {
  assert.deepEqual(SECTIONS.map((s) => s.points), [100, 150, 200]);
  assert.deepEqual(SECTIONS.map((s) => s.name), ["Easy", "Medium", "Hard"]);
});
