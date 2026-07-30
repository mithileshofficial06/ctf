/**
 * Seed a usable dev dataset: indexes, two teams with access codes, and one
 * challenge per event.
 *
 * Run:  npx tsx scripts/seed.ts
 *
 * Prints the PLAINTEXT codes once — they're stored hashed, so this is the only
 * time you'll see them. Regenerate rather than trying to recover one.
 */
import { ObjectId } from "mongodb";
import { collections, ensureIndexes } from "../src/lib/db/client";
import { hashCode, hashAnswer, normaliseCode } from "../src/lib/auth/session";
import { teamNameKey } from "../src/lib/ctf/join";
import { randomBytes } from "node:crypto";

function makeCode(): string {
  // Ambiguous characters removed — these get read aloud and typed by hand.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) =>
    Array.from(randomBytes(n))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `X26-${chunk(5)}-${chunk(5)}`;
}

async function main() {
  console.log("Ensuring indexes…");
  await ensureIndexes();

  const teams = await collections.teams();
  const participants = await collections.participants();
  const codes = await collections.accessCodes();
  const challenges = await collections.challenges();
  const hunt = await collections.huntProgress();

  console.log("Seeding teams + codes…");
  const issued: Array<{ team: string; code: string }> = [];

  for (const name of ["Team Arachnid", "Team Multiverse"]) {
    const teamId = new ObjectId();
    // nameKey carries the unique index that arbitrates the CTF's open join.
    await teams.insertOne({ _id: teamId, name, nameKey: teamNameKey(name), createdAt: new Date() });

    const participantId = new ObjectId();
    await participants.insertOne({
      _id: participantId,
      teamId,
      name: `${name} captain`,
      role: "participant",
      createdAt: new Date(),
    });

    const code = makeCode();
    await codes.insertOne({
      codeHash: hashCode(code),
      teamId,
      participantId,
      role: "participant",
      redeemedAt: null,
    });
    issued.push({ team: name, code: normaliseCode(code) });

    // The hunt only lets a team submit against an unlocked clue, so open the
    // first one for every team up front.
    await hunt.updateOne(
      { teamId, challengeSlug: "clue-1" },
      { $setOnInsert: { teamId, challengeSlug: "clue-1", unlockedAt: new Date(), solvedAt: null, hintsUsed: 0 } },
      { upsert: true }
    );
  }

  console.log("Seeding challenges…");
  await challenges.deleteMany({ slug: { $in: ["clue-1", "clue-2", "q1", "sum-two"] } });
  await challenges.insertMany([
    {
      type: "hunt",
      slug: "clue-1",
      title: "Where it begins",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: { answerHash: hashAnswer("library"), nextSlug: "clue-2", hintCosts: [10, 25] },
    },
    {
      type: "hunt",
      slug: "clue-2",
      title: "Second thread",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: { answerHash: hashAnswer("rooftop"), hintCosts: [15] },
    },
    // NOTE: no ctf challenge here. The CTF owns its own content and unlock
    // chain — see scripts/seed-ctf.ts. Seeding one from here would be deleted
    // by that script anyway, and a half-seeded round breaks the gate.
    {
      type: "quiz",
      slug: "q1",
      title: "Which year is Miguel from?",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: { correctIndex: 2, limitSeconds: 30, speedBonus: 50 },
    },
    {
      type: "code",
      slug: "sum-two",
      title: "Sum two numbers",
      points: 300,
      opensAt: null,
      closesAt: null,
      config: { testsRef: "tests/sum-two.json" },
    },
  ]);

  console.log("\n── ACCESS CODES (shown once, stored hashed) ─────────────");
  for (const i of issued) console.log(`  ${i.team.padEnd(18)} ${i.code}`);
  console.log("────────────────────────────────────────────────────────\n");
  console.log("Try: hunt clue-1 → 'library' · quiz q1 → '2|<servedAtISO>'  ·  CTF: run npm run seed:ctf");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
