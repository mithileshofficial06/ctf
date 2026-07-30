/**
 * Seed the CTF challenges.
 *
 * Run:  npm run seed:ctf
 *
 * Flags reach the database ONLY as hashAnswer(flag). This script then PROVES it
 * twice: once against the documents it wrote, and once against the public
 * content module itself — because that is where the payloads live, and a
 * payload whose encoding is too thin is the likeliest way an answer escapes.
 *
 * A leak is almost never a flag sitting in a flag field. It is a slug named
 * after the answer, a payload that is really just the flag with spaces in it,
 * or fragments in an array that join back together. Stripping punctuation from
 * the whole serialised document catches all three.
 */
import { collections, ensureIndexes } from "../src/lib/db/client";
import { hashAnswer } from "../src/lib/auth/session";
import { CTF_CHALLENGES, CTF_SLUGS, SECTION_LABEL, sectionLayout } from "../src/lib/ctf/content";
import { teamNameKey } from "../src/lib/ctf/join";
import { CTF_FLAGS } from "../src/lib/ctf/content.server";
import { findLeaks } from "../src/lib/ctf/leak-check";
import { SECTIONS } from "../src/lib/ctf/sections";
import type { Challenge } from "../src/lib/db/types";

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/**
 * Get the teams collection into a state where a UNIQUE index on nameKey can
 * actually be built.
 *
 * Two ways it cannot be: documents written before the field existed (they index
 * as null, and two nulls are a duplicate), and genuine duplicate names left
 * over from a rehearsal. Both are silent — createIndex simply fails, and
 * ensureIndexes logs and moves on — so the open join runs unprotected.
 */
async function prepareTeamNames(): Promise<void> {
  const teams = await collections.teams();

  const legacy = await teams.find({ nameKey: { $exists: false } }).toArray();
  for (const team of legacy) {
    await teams.updateOne({ _id: team._id }, { $set: { nameKey: teamNameKey(team.name) } });
  }
  if (legacy.length) console.log(`Backfilled nameKey on ${legacy.length} pre-existing team(s).`);

  const duplicates = await teams
    .aggregate<{ _id: string; count: number; names: string[] }>([
      { $group: { _id: "$nameKey", count: { $sum: 1 }, names: { $push: "$name" } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicates.length) {
    console.error("\nDuplicate team names already in the database:");
    for (const d of duplicates) console.error(`  "${d._id}" × ${d.count}  (${d.names.join(", ")})`);
    fail(
      "The unique index cannot be built over these, and without it the open join\n" +
        "is unprotected. Clear the roster first — the host Reset button does it —\n" +
        "then run this again."
    );
  }
}

/** Refuse to finish if the guarantee the open join depends on is not in place. */
async function assertUniqueTeamNames(): Promise<void> {
  const teams = await collections.teams();
  const present = (await teams.indexes()).some(
    (i) => i.unique === true && i.key?.nameKey === 1
  );
  if (!present) {
    fail(
      "teams.nameKey is NOT a unique index.\n" +
        "Two teams could register the same name. Fix the cause above and re-run."
    );
  }
  console.log("  teams.nameKey unique index verified ✓");
}

async function main() {
  // ── Content sanity, before anything touches the database ────────────────

  const missingFlag = CTF_SLUGS.filter((slug) => !CTF_FLAGS[slug]);
  const orphanFlag = Object.keys(CTF_FLAGS).filter((slug) => !CTF_SLUGS.includes(slug));
  if (missingFlag.length || orphanFlag.length) {
    if (missingFlag.length) console.error(`  slugs with no flag:  ${missingFlag.join(", ")}`);
    if (orphanFlag.length) console.error(`  flags with no slug:  ${orphanFlag.join(", ")}`);
    fail("Content and flags disagree.");
  }

  // Two questions sharing a position in a section would render as two cards
  // both labelled "Easy 2", which is a confusing thing to project at people.
  for (const section of SECTIONS.map((s) => s.section)) {
    const inSection = CTF_CHALLENGES.filter((c) => c.section === section);
    const orders = inSection.map((c) => c.order).sort((a, b) => a - b);
    const expected = inSection.map((_, i) => i + 1);
    if (orders.join() !== expected.join()) {
      fail(
        `Section ${section} is numbered wrong: orders are [${orders.join(", ")}], expected [${expected.join(", ")}].`
      );
    }
    if (inSection.length === 0) fail(`Section ${section} has no questions.`);
  }

  // The check that matters most, run against the SOURCE rather than the DB, so
  // a bad payload never reaches a participant's screen at all.
  const contentLeaks = findLeaks(CTF_CHALLENGES, CTF_FLAGS);
  if (contentLeaks.length) {
    fail(
      `PLAINTEXT FLAG LEAK in src/lib/ctf/content.ts for: ${contentLeaks.join(", ")}\n` +
        "Check the slug, title, prompt and payload of those challenges."
    );
  }

  // Teams must be ready for the unique index BEFORE it is built — see below.
  await prepareTeamNames();

  console.log("Ensuring indexes…");
  await ensureIndexes();

  // ensureIndexes logs failures and carries on, which is right for indexes that
  // only make things fast. This one is not one of those: without it, two teams
  // registering the same name in the same instant BOTH succeed, and the event
  // starts with two teams nobody can tell apart. Verify it landed.
  await assertUniqueTeamNames();

  const challenges = await collections.challenges();

  const docs: Challenge[] = CTF_CHALLENGES.map((c) => ({
    type: "ctf" as const,
    slug: c.slug,
    title: c.title,
    // Informational only: the award comes from the SECTION at solve time, never
    // from the challenge document. Kept in step so an admin reading the DB
    // isn't misled about what a question is worth.
    points: SECTIONS.find((s) => s.section === c.section)?.points ?? 0,
    opensAt: null,
    closesAt: null,
    config: {
      // The ONLY form a flag takes in the database.
      answerHash: hashAnswer(CTF_FLAGS[c.slug]),
      section: c.section,
      order: c.order,
      attachments: c.attachments,
    },
  }));

  console.log(`\nSeeding ${docs.length} CTF challenges…`);
  await challenges.deleteMany({ type: "ctf" });
  await challenges.insertMany(docs);

  // ── Prove it against what actually landed ───────────────────────────────
  console.log("\nChecking for plaintext flag leaks…");
  const seeded = await challenges.find({ type: "ctf" }).toArray();

  if (seeded.length !== docs.length) {
    fail(`Expected ${docs.length} documents back, got ${seeded.length}.`);
  }

  const leaks = seeded
    .map((doc) => ({ slug: doc.slug, leaked: findLeaks(doc, CTF_FLAGS) }))
    .filter((r) => r.leaked.length > 0);

  if (leaks.length) {
    for (const leak of leaks) {
      console.error(`  document "${leak.slug}" contains the flag for: ${leak.leaked.join(", ")}`);
    }
    // Do not leave a leaking document live in the database.
    await challenges.deleteMany({ type: "ctf" });
    fail("PLAINTEXT FLAG LEAK — the seed has been rolled back.");
  }

  console.log("  no plaintext flags found in the content or the documents ✓");

  const layout = sectionLayout();
  console.log("\n── SEEDED ─────────────────────────────────────────────");
  for (const spec of SECTIONS) {
    console.log(
      `  ${SECTION_LABEL[spec.section].padEnd(6)} · ${String(spec.points).padStart(3)} pts each · ${layout[spec.section - 1].length} questions`
    );
    layout[spec.section - 1].forEach((slug, i) => console.log(`      ${i + 1}. ${slug}`));
  }
  const total = SECTIONS.reduce((sum, s) => sum + s.points * layout[s.section - 1].length, 0);
  console.log("───────────────────────────────────────────────────────");
  console.log(`  ${layout.flat().length} questions · ${total} points available`);
  console.log("\nTeams join and press Start themselves. Organiser view: /adminofctf");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
