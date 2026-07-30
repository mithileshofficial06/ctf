import { test } from "node:test";
import assert from "node:assert/strict";
import { rankStandings, type StandingsRow } from "./board";

function row(over: Partial<StandingsRow> & { teamId: string }): StandingsRow {
  return {
    teamName: over.teamId,
    points: 0,
    solved: 0,
    startedAt: null,
    elapsedMs: null,
    finished: false,
    finishedAt: null,
    lastSolveAt: null,
    ...over,
  };
}

const MIN = 60_000;

test("higher points rank first", () => {
  const ranked = rankStandings([
    row({ teamId: "low", points: 100 }),
    row({ teamId: "high", points: 900 }),
    row({ teamId: "mid", points: 400 }),
  ]);
  assert.deepEqual(ranked.map((r) => r.teamId), ["high", "mid", "low"]);
});

test("level on points, the FASTER run wins", () => {
  const ranked = rankStandings([
    row({ teamId: "slow", points: 1150, elapsedMs: 53 * MIN, finished: true }),
    row({ teamId: "fast", points: 1150, elapsedMs: 41 * MIN, finished: true }),
  ]);
  assert.deepEqual(ranked.map((r) => r.teamId), ["fast", "slow"]);
});

test("elapsed is measured per team, so starting late is not a penalty", () => {
  // BRAVO began 5 minutes after ALPHA and still took less time overall.
  const alpha = row({
    teamId: "alpha",
    points: 1150,
    startedAt: new Date("2026-08-01T10:00:00Z"),
    finishedAt: new Date("2026-08-01T10:50:00Z"),
    elapsedMs: 50 * MIN,
    finished: true,
  });
  const bravo = row({
    teamId: "bravo",
    points: 1150,
    startedAt: new Date("2026-08-01T10:05:00Z"),
    finishedAt: new Date("2026-08-01T10:48:00Z"),
    elapsedMs: 43 * MIN,
    finished: true,
  });

  assert.deepEqual(rankStandings([alpha, bravo]).map((r) => r.teamId), ["bravo", "alpha"]);
});

test("a team that has not started sorts below one that has, on equal points", () => {
  const ranked = rankStandings([
    row({ teamId: "waiting", points: 0, elapsedMs: null }),
    row({ teamId: "running", points: 0, elapsedMs: 3 * MIN }),
  ]);
  assert.equal(ranked[0].teamId, "running");
});

test("points beat speed — a slower team with more solves still leads", () => {
  const ranked = rankStandings([
    row({ teamId: "quick-but-short", points: 300, elapsedMs: 2 * MIN }),
    row({ teamId: "slow-but-thorough", points: 900, elapsedMs: 55 * MIN }),
  ]);
  assert.deepEqual(ranked.map((r) => r.teamId), ["slow-but-thorough", "quick-but-short"]);
});

test("teams level on everything sort by name, so the board does not shuffle between polls", () => {
  const first = rankStandings([
    row({ teamId: "b", teamName: "Bravo", points: 200, elapsedMs: 5 * MIN }),
    row({ teamId: "a", teamName: "Alpha", points: 200, elapsedMs: 5 * MIN }),
  ]);
  const second = rankStandings([
    row({ teamId: "a", teamName: "Alpha", points: 200, elapsedMs: 5 * MIN }),
    row({ teamId: "b", teamName: "Bravo", points: 200, elapsedMs: 5 * MIN }),
  ]);

  assert.deepEqual(first.map((r) => r.teamName), ["Alpha", "Bravo"]);
  assert.deepEqual(first.map((r) => r.teamName), second.map((r) => r.teamName));
});

test("ranking does not mutate the caller's array", () => {
  const rows = [row({ teamId: "a", points: 1 }), row({ teamId: "b", points: 9 })];
  rankStandings(rows);
  assert.deepEqual(rows.map((r) => r.teamId), ["a", "b"]);
});
