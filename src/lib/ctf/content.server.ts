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
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  ⚠  SEVEN OF THESE ARE PLACEHOLDERS, NOT THE REAL ANSWERS.
 *
 *  The question DOCUMENTS give the narrative but not the flag string — that is
 *  only known to you, the organiser (and for the file-based challenges it is
 *  whatever your QR / maze / image / stego artifact decodes to). Until you put
 *  the real SPIDER{...} value here and re-run `npm run seed:ctf`, a correct
 *  student answer will be graded WRONG. Replace every value marked PLACEHOLDER.
 *
 *  Grading is case-insensitive (hashAnswer lowercases), so `SPIDER{Ab}` and
 *  `spider{ab}` are the same answer — do not rely on case to distinguish flags.
 * ─────────────────────────────────────────────────────────────────────────
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
 */
export const CTF_FLAGS: Record<string, string> = {
  // ── Easy · 100 pts ──
  // Whatever your intercepted ciphertext decodes to.
  "web-of-secrets": "SPIDER{PLACEHOLDER_set_web_of_secrets_flag}",
  // The password behind MD5 4073009c1933169ac8452322efdb1adf. Being cracked;
  // if the crack lands, this becomes SPIDER{<that password>}.
  "broken-portal": "SPIDER{PLACEHOLDER_set_broken_portal_flag}",
  // Whatever the repaired QR code scans to.
  "qr-puzzle": "SPIDER{PLACEHOLDER_set_qr_puzzle_flag}",

  // ── Medium · 150 pts ──
  // The decoded label sequence along the correct maze path.
  "spot-maze": "SPIDER{PLACEHOLDER_set_spot_maze_flag}",
  // The message hidden in the forensics image.
  "image-encryption": "SPIDER{PLACEHOLDER_set_image_encryption_flag}",
  // The key hidden in the leaked chat log.
  "chat-leak": "SPIDER{PLACEHOLDER_set_chat_leak_flag}",

  // ── Hard · 200 pts ──
  // The flag the AI guardian releases in its final layer.
  "ai-escape-room": "SPIDER{PLACEHOLDER_set_ai_escape_room_flag}",
  // The final decoded string after every stego layer is peeled.
  "steganography": "SPIDER{PLACEHOLDER_set_steganography_flag}",
};

/**
 * slug → ordered hints.
 *
 * Empty on purpose: the hints from the question documents now live inside each
 * challenge's `prompt` in content.ts, so a team reads them in the dialog. This
 * map is kept as the seam for a future gated-hint feature — nothing imports it
 * today — so hints never get tempted into the public module by the back door.
 */
export const CTF_HINTS: Record<string, string[]> = {};
