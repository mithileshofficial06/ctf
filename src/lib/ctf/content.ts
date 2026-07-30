/**
 * CTF challenge content — the PUBLIC half.
 *
 * Everything in this file is safe for the client bundle: it is what a team is
 * meant to see. Flags live in `content.server.ts`, which the client may never
 * import — a lint rule enforces that, because a rule a machine checks outlives
 * the person who remembers it.
 *
 * Nothing here may encode an answer. Not a slug, not a title, not a brief, not
 * a prompt, not a payload. `scripts/seed-ctf.ts` scans this file with
 * punctuation stripped and refuses to seed if a flag — or the part inside the
 * braces — shows up.
 *
 * ── SHAPE OF THE EVENT ────────────────────────────────────────────────────
 * Three difficulty sections: Easy (3), Medium (3), Hard (2). ALL EIGHT ARE OPEN
 * from the moment a team presses Start. `order` is presentation only — there is
 * no unlock chain, so a team may take the hard questions first if they like.
 *
 * `brief` is the one line on the card; `prompt` is the full explanation in the
 * dialog. They are separate fields because the card must stay scannable at a
 * glance while the dialog can afford to actually teach the technique — a team
 * that has never seen base64 should be able to finish Easy 1 from the dialog
 * alone, without a hint system and without an organiser standing over them.
 *
 * These eight are solvable with nothing but a browser and CyberChef, and they
 * carry no attachments — so the whole event runs without blob storage
 * configured. Replace the prompts and flags with your own; keep the shape.
 */

import { SECTION_KEYS, type SectionKey } from "./sections";

export type CtfSection = SectionKey;
export const CTF_SECTIONS = SECTION_KEYS;

/**
 * Section accents.
 *
 * Three hues, taken from the palette validated against the card surface for
 * lightness band, chroma floor, CVD separation and contrast. Colour is NEVER
 * the identity channel: every section is its own titled block and every card
 * states its difficulty and its points in words.
 */
export const SECTION_COLOR: Record<CtfSection, string> = {
  1: "#00A98F",
  2: "#C47F00",
  3: "#FF3B6B",
};

export const SECTION_LABEL: Record<CtfSection, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
};

export interface CtfChallengeContent {
  slug: string;
  title: string;
  section: CtfSection;
  /** 1-based position within the section. Display order only — nothing locks. */
  order: number;
  /** One line, shown on the card. Enough to choose what to work on. */
  brief: string;
  /** The full explanation, shown in the dialog. */
  prompt: string;
  /**
   * The thing to actually work on — ciphertext, a dump, an encoded blob.
   * Rendered monospace and selectable, separate from the prose so a long
   * payload doesn't turn the explanation into a wall.
   */
  payload?: string;
  /** Blob NAMES, not URLs. Uploaded by scripts/upload-ctf-files.ts. */
  attachments: string[];
}

/** Every flag in this event looks like this. Published, so it is not a secret. */
export const FLAG_FORMAT = "flag{...}";

export const CTF_CHALLENGES: CtfChallengeContent[] = [
  // ── EASY · 100 points each ──────────────────────────────────────────────
  {
    slug: "warm-up",
    title: "Warm Up",
    section: 1,
    order: 1,
    brief: "A string of letters ending in equals signs. Decode it.",
    prompt:
      "Base64 is an ENCODING, not encryption. It exists to carry arbitrary bytes through channels that only " +
      "accept text, and anyone can reverse it — there is no key. You can spot it by its alphabet (A–Z, a–z, " +
      "0–9, + and /) and by the '=' padding at the end.\n\n" +
      "Decode the string below back into readable text and submit what you find. Any base64 decoder will do: " +
      "CyberChef's 'From Base64' operation, or in a browser console, atob(\"...\").",
    payload: "ZmxhZ3tiNjRfaXNfbjB0X2FfbDBja30=",
    attachments: [],
  },
  {
    slug: "read-me-backwards",
    title: "Backwards Day",
    section: 1,
    order: 2,
    brief: "Not encrypted. Somebody just wrote it starting from the wrong end.",
    prompt:
      "Nothing here is encrypted or encoded — the characters are exactly the ones you want, in exactly the " +
      "wrong order. Notice that the string ENDS with an opening brace and BEGINS with a closing one, which is " +
      "the giveaway.\n\n" +
      "Reverse the whole string, character by character, and submit the result. CyberChef's 'Reverse' " +
      "operation does it, or in a browser console: \"...\".split(\"\").reverse().join(\"\").",
    payload: "}yaw_rehto_eht_da3r{galf",
    attachments: [],
  },
  {
    slug: "caesars-salad",
    title: "Caesar Salad",
    section: 1,
    order: 3,
    brief: "Every letter took the same walk down the alphabet. Walk it back.",
    prompt:
      "A Caesar cipher shifts every letter the same number of places through the alphabet, wrapping around " +
      "from z back to a. Here the shift is THIRTEEN — the variant usually called ROT13, which is its own " +
      "inverse: applying it a second time gives you the original text back.\n\n" +
      "Digits, underscores and braces are left untouched, which is why the shape of the answer is already " +
      "visible below. Shift the letters back and submit it. CyberChef's 'ROT13' operation does this in one " +
      "step.",
    payload: "synt{fu1sg_unccraf_gjvpr}",
    attachments: [],
  },

  // ── MEDIUM · 150 points each ────────────────────────────────────────────
  {
    slug: "hex-appeal",
    title: "Hex Appeal",
    section: 2,
    order: 1,
    brief: "Two characters per byte, sixteen possible values each.",
    prompt:
      "This is hexadecimal: base 16, using the digits 0–9 and the letters a–f. Every PAIR of characters is one " +
      "byte, and every byte here is a printable ASCII character. So '66' is one character, '6c' is the next, " +
      "and so on.\n\n" +
      "Convert the pairs to bytes and read the bytes as text. CyberChef's 'From Hex' operation does it. Watch " +
      "the length: an odd number of characters means you have copied it wrong.",
    payload: "666c61677b6865785f69735f6a7573745f626173655f31367d",
    attachments: [],
  },
  {
    slug: "count-in-twos",
    title: "Count In Twos",
    section: 2,
    order: 2,
    brief: "The same idea as hex, with only two digits to choose from.",
    prompt:
      "Same principle as the hex question, one base lower. This is binary — base 2 — and it is already " +
      "helpfully split for you: each group of EIGHT digits separated by a space is one byte, and each byte is " +
      "one printable ASCII character.\n\n" +
      "Convert each group to its numeric value, then read that value as an ASCII character. CyberChef's 'From " +
      "Binary' operation handles the spaces on its own. Count the groups before you start — that tells you how " +
      "long the answer is.",
    payload:
      "01100110 01101100 01100001 01100111 01111011 01100010 00110001 01101110 01100001 01110010 01111001 01011111 01100011 00110000 01110101 01101110 01110100 01110011 01011111 01110100 01101111 01101111 01111101",
    attachments: [],
  },
  {
    slug: "mirror-mirror",
    title: "Mirror, Mirror",
    section: 2,
    order: 3,
    brief: "The alphabet, read from the other end.",
    prompt:
      "This is the Atbash cipher. It mirrors the alphabet: a becomes z, b becomes y, c becomes x, all the way " +
      "through — and because the mapping is symmetric, applying it again undoes it.\n\n" +
      "Unlike a Caesar shift there is no key to guess; there is only one Atbash. Digits, underscores and braces " +
      "were left alone, so the shape of the answer is already visible below. CyberChef has an 'Atbash Cipher' " +
      "operation, or you can do it by hand — it is only 22 letters.",
    payload: "uozt{zgy4hs_n1iilih_rg}",
    attachments: [],
  },

  // ── HARD · 200 points each ──────────────────────────────────────────────
  {
    slug: "layer-cake",
    title: "Layer Cake",
    section: 3,
    order: 1,
    brief: "One disguise was not enough. Strip it and you are still not done.",
    prompt:
      "Encodings stack. This payload was encoded, and then the RESULT of that was encoded again with a " +
      "different scheme, so peeling off the outer layer will not hand you the answer — it will hand you " +
      "something that should look familiar from the Medium section.\n\n" +
      "The '=' padding tells you what the outer layer is. Remove it, look carefully at what you get before " +
      "assuming you have failed, and then remove the inner one too. In CyberChef you can chain both operations " +
      "in the recipe and watch the output resolve in one pass.",
    payload: "NjY2YzYxNjc3Yjc0NzczMDVmNmM2MTc5NjU3MjczNWY2NDY1NjU3MDVmNmU2Zjc3N2Q=",
    attachments: [],
  },
  {
    slug: "exclusive-or",
    title: "Exclusive Or",
    section: 3,
    order: 2,
    brief: "Hex, but every byte was combined with a repeating key first.",
    prompt:
      "XOR is a bitwise operation with one property that makes it a cipher: doing it twice with the same key " +
      "returns the original. So the operation that hid this is also the operation that reveals it.\n\n" +
      "The payload below is hex. Decode it to bytes, then XOR those bytes against a repeating key — the key " +
      "cycles back to its first character once it runs out. THE KEY IS THE NAME OF THIS SYMPOSIUM: six " +
      "letters, all lowercase, no year attached.\n\n" +
      "In CyberChef, chain 'From Hex' into 'XOR' with the key entered as UTF-8. If the output is mostly " +
      "unreadable but the occasional character looks right, your key is correct and misaligned — check you " +
      "have not left a space or a digit in it.",
    payload: "1e1c0d08091d4802331a1c0117151f301b110b1500090f",
    attachments: [],
  },
];

export const CTF_SLUGS = CTF_CHALLENGES.map((c) => c.slug);

/**
 * Slugs per section, in display order: `layout[0]` is Easy.
 *
 * Derived from the content rather than written out a second time, so a section
 * whose questions disagree with its listing is a class of bug that cannot occur.
 */
export function sectionLayout(challenges: CtfChallengeContent[] = CTF_CHALLENGES): string[][] {
  return CTF_SECTIONS.map((section) =>
    challenges
      .filter((c) => c.section === section)
      .sort((a, b) => a.order - b.order)
      .map((c) => c.slug)
  );
}

/** Where a slug sits in the event. Undefined for anything not in the content. */
export function locate(slug: string): { section: CtfSection; order: number } | undefined {
  const found = CTF_CHALLENGES.find((c) => c.slug === slug);
  return found ? { section: found.section, order: found.order } : undefined;
}
