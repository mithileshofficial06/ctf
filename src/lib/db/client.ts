import { MongoClient, type Db, type Collection } from "mongodb";
import { requireEnv } from "@/lib/config";
import type {
  AccessCode,
  Challenge,
  HuntProgress,
  LeaderboardSnapshot,
  Participant,
  ScoreEvent,
  Submission,
  Team,
} from "./types";

/**
 * Mongo client as a module singleton.
 *
 * Container Apps runs several replicas and each replica may handle many
 * concurrent requests; creating a client per request would exhaust the
 * connection pool the moment traffic spikes. The driver pools internally, so
 * one client per process is both correct and what we want under a 500-user
 * burst. The global cache also survives dev hot-reload, which otherwise leaks
 * a new pool on every file save.
 */

declare global {
  // `var` is required, not a style choice: `let`/`const` in a global declaration
  // do not attach to globalThis, so the cache would not survive hot reload.
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient(): Promise<MongoClient> {
  const uri = requireEnv("MONGODB_URI");
  return new MongoClient(uri, {
    // Keep the pool modest per replica: ACA scales out horizontally, so many
    // small pools beat one large one, and Cosmos vCore has per-account limits.
    maxPoolSize: 20,
    minPoolSize: 0,
    // Fail fast rather than hanging a request for 30s if the DB is unreachable.
    serverSelectionTimeoutMS: 5_000,
    // retryWrites is deliberately NOT set here. Cosmos DB's RU-based Mongo API
    // rejects retryable writes outright ("Retryable writes are not supported"),
    // and its connection string carries retrywrites=false to say so. An explicit
    // driver option overrides the URI, so hardcoding `true` breaks every write
    // against Cosmos while looking harmless. Leaving it unset lets the URI
    // decide: false on Cosmos, the driver's default true on a plain mongod.
  }).connect();
}

function clientPromise(): Promise<MongoClient> {
  if (!global.__mongoClientPromise) {
    global.__mongoClientPromise = createClient();
  }
  return global.__mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB ?? "xplore26");
}

/** Typed collection accessors — one place that knows the collection names. */
export const collections = {
  teams: async (): Promise<Collection<Team>> => (await getDb()).collection<Team>("teams"),
  participants: async (): Promise<Collection<Participant>> =>
    (await getDb()).collection<Participant>("participants"),
  accessCodes: async (): Promise<Collection<AccessCode>> =>
    (await getDb()).collection<AccessCode>("access_codes"),
  challenges: async (): Promise<Collection<Challenge>> =>
    (await getDb()).collection<Challenge>("challenges"),
  submissions: async (): Promise<Collection<Submission>> =>
    (await getDb()).collection<Submission>("submissions"),
  scoreEvents: async (): Promise<Collection<ScoreEvent>> =>
    (await getDb()).collection<ScoreEvent>("score_events"),
  huntProgress: async (): Promise<Collection<HuntProgress>> =>
    (await getDb()).collection<HuntProgress>("hunt_progress"),
  leaderboards: async (): Promise<Collection<LeaderboardSnapshot>> =>
    (await getDb()).collection<LeaderboardSnapshot>("leaderboard_snapshots"),
};

/**
 * Create the indexes the hot paths depend on. Safe to run repeatedly.
 * Call from a seed/admin script, not per request.
 *
 * These matter most under load:
 *  - access_codes.codeHash  → login is a single indexed lookup
 *  - score_events.teamId    → the materializer aggregates by team
 *  - submissions.status     → the judge queue reconciler scans by status
 *  - submissions.team_correct → a team's solve times drive its round progress
 *
 * teams.nameKey is UNIQUE and is doing real work: with an open join, two people
 * can submit the same team name in the same millisecond. The index is what
 * makes one of them lose cleanly instead of both teams existing.
 *
 * Failures are LOGGED, NOT THROWN. This uses Promise.allSettled deliberately:
 * with Promise.all, a single index Cosmos refuses rejects the whole call, and
 * because this is awaited at the top of the seed script the seed aborts while
 * appearing to have run. That failure mode reads as "stale data" when it is
 * actually "no data" — hours were lost to it once already. Do not "tidy" this
 * back into Promise.all.
 */
export async function ensureIndexes(): Promise<void> {
  const [codes, teams, challenges, subs, scores, hunt, boards] = await Promise.all([
    collections.accessCodes(),
    collections.teams(),
    collections.challenges(),
    collections.submissions(),
    collections.scoreEvents(),
    collections.huntProgress(),
    collections.leaderboards(),
  ]);

  const specs: Array<[string, Promise<string>]> = [
    ["access_codes.codeHash", codes.createIndex({ codeHash: 1 }, { unique: true })],
    // Open join races on this one. See the note above.
    ["teams.nameKey", teams.createIndex({ nameKey: 1 }, { unique: true })],
    ["challenges.type_slug", challenges.createIndex({ type: 1, slug: 1 }, { unique: true })],
    ["submissions.team_receivedAt", subs.createIndex({ teamId: 1, receivedAt: -1 })],
    ["submissions.status", subs.createIndex({ status: 1 })],
    // Duplicate-solve checks hit this one.
    ["submissions.challenge_team", subs.createIndex({ challengeId: 1, teamId: 1, receivedAt: 1 })],
    // Solve counts per challenge — the board's per-question solve tally.
    ["submissions.ctf_solves", subs.createIndex({ challengeId: 1, "verdict.correct": 1 })],
    // Per-team solve set. Every team's score and elapsed time is derived from
    // it, so this is the hottest index in the CTF.
    ["submissions.team_correct", subs.createIndex({ teamId: 1, "verdict.correct": 1 })],
    // The admin feed reads the newest submissions across every team.
    ["submissions.type_receivedAt", subs.createIndex({ type: 1, receivedAt: -1 })],
    ["score_events.teamId", scores.createIndex({ teamId: 1 })],
    ["score_events.event_at", scores.createIndex({ event: 1, at: -1 })],
    ["hunt_progress.team_slug", hunt.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    ["leaderboards.event", boards.createIndex({ event: 1 }, { unique: true })],
  ];

  const results = await Promise.allSettled(specs.map(([, p]) => p));

  results.forEach((result, i) => {
    const [name] = specs[i];
    if (result.status === "fulfilled") {
      console.log(`  index ok       ${name}`);
    } else {
      console.warn(`  index FAILED   ${name}: ${result.reason}`);
    }
  });
}
