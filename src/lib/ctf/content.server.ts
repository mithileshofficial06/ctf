/**
 * CTF flags — the SECRET half. SERVER ONLY.
 *
 * This module must never reach the client bundle. Three things keep it out:
 *
 *  1. The `.server.ts` suffix and this comment, for humans.
 *  2. A `no-restricted-imports` rule in eslint.config.mjs, for CI.
 *  3. The runtime guard below, for whatever gets past the first two.
 *
 * Flags reach the database ONLY as hashAnswer(flag). They are never stored in
 * plaintext, never in a config field, never in a filename. scripts/seed-ctf.ts
 * proves that after every seed rather than trusting this comment — and it
 * checks the public content module too, since that is where the payloads live.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "content.server.ts was imported into the browser bundle — the CTF flags just shipped to every participant"
  );
}

/**
 * slug → plaintext flag.
 *
 * Keep these out of slugs, titles, prompts and payloads in content.ts. A leak
 * is almost never a flag in a flag field: it is a slug named after the answer,
 * or a payload whose encoding is thin enough to read at a glance.
 *
 * Every payload in content.ts was generated FROM the flag below it and verified
 * to decode back to it exactly. If you change a flag, regenerate its payload —
 * a challenge whose payload decodes to something else accepts nothing, and
 * looks like a grader bug for the first twenty minutes of the event.
 */
export const CTF_FLAGS: Record<string, string> = {
  // Round 1 · Easy
  "warm-up": "flag{b64_is_n0t_a_l0ck}",
  "read-me-backwards": "flag{r3ad_the_other_way}",
  "caesars-salad": "flag{sh1ft_happens_twice}",

  // Round 2 · Medium
  "hex-appeal": "flag{hex_is_just_base_16}",
  "count-in-twos": "flag{b1nary_c0unts_too}",
  "mirror-mirror": "flag{atb4sh_m1rrors_it}",

  // Round 3 · Hard
  "layer-cake": "flag{tw0_layers_deep_now}",
  "exclusive-or": "flag{x0r_undoes_itself}",
};

/**
 * slug → ordered hints. Not wired to a cost — live hints are deliberately out
 * of scope for this format, since a round already has a hard deadline and
 * paying points to beat it would make elimination a wallet problem. Kept here
 * so they are never tempted into the public module later.
 */
export const CTF_HINTS: Record<string, string[]> = {
  "caesars-salad": ["Thirteen forward and thirteen forward again is where you started."],
  "count-in-twos": ["Split on the spaces first. Each group is one character."],
  "mirror-mirror": ["a becomes z, b becomes y. Write the alphabet twice, second time reversed."],
  "layer-cake": ["What comes out of the first decode is two characters per byte."],
  "exclusive-or": ["Six letters. It is printed at the top of this page."],
};
