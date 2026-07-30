/**
 * Plaintext flag leak detection.
 *
 * Used by the seed (after writing) and by the end-to-end verifier (against
 * live API responses). Shared so both look for leaks the same way.
 *
 * The trick is to serialise the whole thing and strip every character that is
 * not a letter or digit. A leak is almost never a flag sitting in a `flag`
 * field — all four of these have shipped on this platform:
 *
 *   - a slug named after the answer
 *   - a filename
 *   - a word list where one entry happens to be the answer
 *   - five two-character fragments in an array that join back into it
 *
 * Stripping punctuation catches every one, including the fragments: JSON's
 * quotes and commas disappear along with the flag's own braces and
 * underscores, so `["fl","ag","{","x","}"]` and `flag{x}` normalise alike.
 */

/** Lowercase, then discard everything that is not a letter or digit. */
export function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Shortest inner payload worth searching for on its own. Below this, a bare
 * payload is too short to be distinctive and would fire on ordinary prose.
 */
const MIN_INNER_LENGTH = 8;

/**
 * What to search for, given one flag: the whole thing, AND the part inside the
 * wrapper.
 *
 * The wrapper (`flag{...}`) is a PUBLISHED CONSTANT — every participant knows
 * the format. So leaking only the inside is a complete leak: anyone who sees
 * `n3ver_trust_the_client` can wrap it themselves. Searching for the full flag
 * alone misses exactly that, which is the most likely way a prompt or a hint
 * gives the game away.
 */
export function leakNeedles(flag: string): string[] {
  const needles = new Set<string>();

  const full = normalise(flag);
  if (full.length > 0) needles.add(full);

  const inner = /^[^{]*\{(.+)\}\s*$/.exec(flag)?.[1];
  if (inner) {
    const normalisedInner = normalise(inner);
    if (normalisedInner.length >= MIN_INNER_LENGTH) needles.add(normalisedInner);
  }

  return [...needles];
}

/**
 * Which of `flags` appear in `subject`, with punctuation stripped.
 *
 * `subject` may be any JSON-serialisable value — a Mongo document, an API
 * response body, an array of either.
 */
export function findLeaks(subject: unknown, flags: Record<string, string>): string[] {
  const haystack = normalise(JSON.stringify(subject) ?? "");
  return Object.entries(flags)
    .filter(([, flag]) => leakNeedles(flag).some((needle) => haystack.includes(needle)))
    .map(([slug]) => slug);
}

/** Does `subject` contain anything that looks like a stored answer hash? */
export function findAnswerHashes(subject: unknown): boolean {
  return JSON.stringify(subject)?.includes("answerHash") ?? false;
}
