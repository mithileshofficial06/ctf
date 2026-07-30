import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";
import { MAX_TEAM_NAME } from "@/lib/config";

/**
 * Open join: a team is created by typing a name, with no pre-issued code.
 *
 * That removes the printed-slip step entirely — one link is the whole entry
 * flow — and moves the interesting problem to uniqueness. Two people can type
 * "Spider Society" in the same millisecond, and check-then-insert lets both
 * through, leaving two teams with one name and a scoreboard nobody can read.
 *
 * So the UNIQUE INDEX on `nameKey` decides it: both insert, one wins, the loser
 * gets a duplicate-key error which becomes "that name is taken". The database is
 * the only thing that can arbitrate this correctly, so it does.
 */

const MIN_TEAM_NAME = 2;

/** Mongo's duplicate-key error. The whole race hinges on catching exactly this. */
const DUPLICATE_KEY = 11000;

const SPACE = 32;
const DELETE = 127;

/**
 * Drop control characters (newlines, tabs, DEL).
 *
 * Written as a code-point filter rather than a regex on purpose: the character
 * class would have to contain the very bytes it is removing, and a literal
 * control character sitting in a source file is invisible to review and easy to
 * mangle in transit.
 */
function stripControl(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= SPACE && code !== DELETE) out += ch;
  }
  return out;
}

/**
 * The form uniqueness is enforced on.
 *
 * Case-folded and whitespace-collapsed, so "Spider Society", "spider society"
 * and "Spider  Society" are one team rather than three that look identical on a
 * projector. The display name keeps whatever they typed.
 */
export function teamNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type JoinResult =
  | { ok: true; teamId: string; participantId: string; teamName: string }
  | { ok: false; error: string };

/**
 * Validate a display name.
 *
 * Kept deliberately permissive — this is a symposium, team names are a joke
 * budget — but control characters are stripped, because a name goes onto a
 * projected scoreboard and a newline in it breaks the row for everyone.
 */
export function cleanTeamName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Enter a team name" };

  const name = stripControl(raw).trim().replace(/\s+/g, " ");

  if (name.length < MIN_TEAM_NAME) return { ok: false, error: "That name is too short" };
  if (name.length > MAX_TEAM_NAME) {
    return { ok: false, error: `Keep it under ${MAX_TEAM_NAME} characters` };
  }
  return { ok: true, name };
}

/**
 * Create the team, or fail because the name is taken.
 *
 * One participant row is created alongside it: the rest of the platform is built
 * around participants belonging to teams, and inventing a second shape for CTF
 * would mean the submission pipeline needed to know which event it was serving.
 */
export async function joinTeam(rawName: unknown): Promise<JoinResult> {
  const cleaned = cleanTeamName(rawName);
  if (!cleaned.ok) return { ok: false, error: cleaned.error };

  const [teams, participants] = await Promise.all([
    collections.teams(),
    collections.participants(),
  ]);

  const teamId = new ObjectId();
  const participantId = new ObjectId();
  const now = new Date();

  try {
    await withThrottleRetry(() =>
      teams.insertOne({
        _id: teamId,
        name: cleaned.name,
        nameKey: teamNameKey(cleaned.name),
        createdAt: now,
      })
    );
  } catch (err) {
    if (isDuplicateKey(err)) {
      return { ok: false, error: "That team name is already taken — pick another" };
    }
    throw err;
  }

  await withThrottleRetry(() =>
    participants.insertOne({
      _id: participantId,
      teamId,
      name: `${cleaned.name} captain`,
      role: "participant",
      createdAt: now,
    })
  );

  return {
    ok: true,
    teamId: teamId.toString(),
    participantId: participantId.toString(),
    teamName: cleaned.name,
  };
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && Number((err as { code?: unknown }).code) === DUPLICATE_KEY;
}
