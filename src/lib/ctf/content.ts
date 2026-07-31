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
 * dialog.
 *
 * ── THESE ARE THE ORGANISER'S FINAL QUESTIONS ─────────────────────────────
 * The narrative, category and hints below are the event's real challenges (see
 * the source documents in the "CTF Questions" folder). Some challenges hand the
 * team a FILE or IMAGE (the QR tiles, the maze diagram, the forensics image,
 * the stego media) that is distributed by the organisers rather than embedded
 * here — those are called out in the prompt. Every `SPIDER{...}` shown inside a
 * prompt is the SUBMISSION FORMAT, never the answer; the answers live only in
 * content.server.ts as hashes.
 */

import { SECTION_KEYS, type SectionKey } from "./sections";

export type CtfSection = SectionKey;
export const CTF_SECTIONS = SECTION_KEYS;

/**
 * Section accents — the Spider-Verse comic palette.
 *
 * Cyan / yellow / magenta: the three inks a comic press actually uses, which is
 * why the theme reads as a printed page. Each one is bright enough to sit behind
 * BLACK text at genuine contrast — they are used as flat accent blocks, never as
 * the only signal, since every section is its own titled panel and every card
 * states its difficulty and points in words.
 */
export const SECTION_COLOR: Record<CtfSection, string> = {
  1: "#19E3FF", // Easy — spider cyan
  2: "#FFD400", // Medium — comic yellow
  3: "#FF2D75", // Hard — into-the-verse magenta
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
  /** Short category label, shown on the card and detail pill (e.g. "Cryptography"). */
  category: string;
  /**
   * Decorative figure for the card and detail view — a transparent PNG under
   * /public. Organiser-supplied art with the background removed; purely cosmetic,
   * never the puzzle. Omit for a card with no art.
   */
  image?: string;
  /** One line, shown on the card. Enough to choose what to work on. */
  brief: string;
  /** The full explanation, shown in the dialog. */
  prompt: string;
  /**
   * The thing to actually work on — ciphertext, a hash, an encoded blob.
   * Rendered monospace and selectable, separate from the prose so a long
   * payload doesn't turn the explanation into a wall. Omitted when the team is
   * handed a file or image instead (see the prompt for those).
   */
  payload?: string;
  /** Blob NAMES, not URLs. Uploaded by scripts/upload-ctf-files.ts. */
  attachments: string[];
}

/** Every flag in this event looks like this. Published, so it is not a secret. */
export const FLAG_FORMAT = "SPIDER{...}";

export const CTF_CHALLENGES: CtfChallengeContent[] = [
  // ── EASY · 100 points each ──────────────────────────────────────────────
  {
    slug: "web-of-secrets",
    title: "Web of Secrets",
    section: 1,
    order: 1,
    category: "Cryptography",
    image: "/challenges/web-of-secrets.png",
    brief: "Spider-Man intercepted a transmission hidden behind a classic cipher. Decode it.",
    prompt:
      "Cryptography — Spider Society intercept.\n\n" +
      "Spider-Man has intercepted a secret transmission from Kingpin's henchmen. The message has been encoded " +
      "using a classic cipher that dates back centuries. The Spider Society needs you to decode it and retrieve " +
      "the hidden message before it falls into the wrong hands.\n\n" +
      "Your task: identify the cipher, work out the key or shift, and apply the decryption to reveal the " +
      "plaintext. The intercepted ciphertext is handed to you by the organisers.\n\n" +
      "Submit in the format SPIDER{decoded_message} — only letters, digits and underscores; no spaces or " +
      "quotation marks.\n\n" +
      "Hints:\n" +
      "1. Not all encryption needs a computer. The oldest methods just shift or substitute letters.\n" +
      "2. Count how often each character appears. The most common letter in English is E — does one character " +
      "show up unusually often?\n" +
      "3. If it is a Caesar cipher there are only 25 shifts. Try them all; one produces readable English.",
    attachments: [],
  },
  {
    slug: "broken-portal",
    title: "The Spot's Broken Portal",
    section: 1,
    order: 2,
    category: "Password Cracking",
    image: "/challenges/broken-portal.png",
    brief: "A crashed portal left only an MD5 hash of the access key. Recover the key.",
    prompt:
      "Password cracking — dimensional fragment recovery.\n\n" +
      "A dimensional portal created by The Spot has gone unstable, scattering fragments of encrypted data across " +
      "the Spider-Verse. One fragment holds a critical access key, but all that survives is its raw MD5 hash.\n\n" +
      "The key follows a strict shape — 1 uppercase letter, 3 lowercase letters, then 4 digits, in that exact " +
      "order (pattern [A-Z][a-z][a-z][a-z][0-9][0-9][0-9][0-9], eight characters). That makes the search space " +
      "finite, so brute force is feasible. Recover the original key from the hash below.\n\n" +
      "Submit in the format SPIDER{password}.\n\n" +
      "Hints:\n" +
      "1. Eight characters, fixed structure — the keyspace is small enough to enumerate.\n" +
      "2. MD5 is deterministic. Generate every valid combination, hash each, and compare to the target.\n" +
      "3. Python with hashlib, or an online MD5 cracker, gets there fast.",
    payload:
      "pattern:  [A-Z][a-z][a-z][a-z][0-9][0-9][0-9][0-9]\nMD5 hash: 4073009c1933169ac8452322efdb1adf",
    attachments: [],
  },
  {
    slug: "qr-puzzle",
    title: "QR Puzzle",
    section: 1,
    order: 3,
    category: "QR Code Analysis",
    image: "/challenges/qr-puzzle.png",
    brief: "A damaged QR code hides coordinates to the next rift. Reassemble it and scan.",
    prompt:
      "QR code analysis — Brooklyn wall.\n\n" +
      "Miles Morales has found a strange QR code spray-painted on a wall in Brooklyn, but it has been tampered " +
      "with and will not scan. The Spider Society believes it hides the coordinates to The Spot's next " +
      "dimensional rift. The code's data modules may be rearranged into tiles, partially obscured or inverted, " +
      "or split across pieces.\n\n" +
      "The organisers give you the corrupted QR image. Reconstruct it, fix the corruption, and scan the repaired " +
      "code to retrieve the hidden flag.\n\n" +
      "Submit in the format SPIDER{flag_from_qr}.\n\n" +
      "Hints:\n" +
      "1. A QR code has three square finder patterns, one in each corner except the bottom-right. Use them to " +
      "orient it.\n" +
      "2. If it is split into tiles, reassemble it in an image editor, aligning on the finder patterns and " +
      "timing strips.\n" +
      "3. Once rebuilt, any QR scanner app or an online tool such as zxing.org decodes it.",
    attachments: [],
  },

  // ── MEDIUM · 150 points each ────────────────────────────────────────────
  {
    slug: "spot-maze",
    title: "Spot Maze",
    section: 2,
    order: 1,
    category: "Logic / Encoding",
    image: "/challenges/spot-maze.png",
    brief: "Portals in a maze are labelled with encoded characters. Find the path, decode the labels.",
    prompt:
      "Logic / encoding — a multi-dimensional trap.\n\n" +
      "The Spot has built a maze to trap Spider-Man. Each room is connected by portals, and every portal is " +
      "labelled with an encoded character. Navigate from START (Room A) to END (Room Z), collect the portal " +
      "labels in the order you pass them, and decode the sequence — the result is the hidden flag.\n\n" +
      "The organisers give you the maze diagram. Portal labels are encoded (Base64 or hex). Only one path " +
      "produces a readable message; the rest are dead ends placed by The Spot.\n\n" +
      "Submit in the format SPIDER{decoded_flag}.\n\n" +
      "Hints:\n" +
      "1. Map the rooms and connections first — draw the graph on paper.\n" +
      "2. Not every path reaches the end. Only the correct route decodes to readable text.\n" +
      "3. Concatenate the labels along your path in order, then Base64- or hex-decode. Readable English means " +
      "you found the right path.",
    attachments: [],
  },
  {
    slug: "image-encryption",
    title: "Image Encryption",
    section: 2,
    order: 2,
    category: "Digital Forensics",
    image: "/challenges/image-encryption.png",
    brief: "An intercepted photo looks ordinary, but a message is embedded in the pixels.",
    prompt:
      "Digital forensics — an intercepted photo.\n\n" +
      "The Spider Society has intercepted a suspicious image transmitted by Kingpin's network. On the surface it " +
      "is an ordinary photo, but analysts believe a secret message is embedded inside it. Your job is to extract " +
      "the hidden data.\n\n" +
      "The organisers give you the image. It may have been manipulated with LSB steganography, XOR pixel " +
      "encryption with a known key, hidden EXIF metadata, or data appended after the EOF marker.\n\n" +
      "Submit in the format SPIDER{hidden_message}.\n\n" +
      "Hints:\n" +
      "1. Start simple — run `strings` on the file and read the EXIF metadata with a tool like ExifTool. Data " +
      "is sometimes hidden in plain sight.\n" +
      "2. Check for data appended after the EOF marker (FFD9 for JPEG) with a hex editor.\n" +
      "3. If the pixels look unusual, try LSB extraction with StegSolve or zsteg.",
    attachments: [],
  },
  {
    slug: "chat-leak",
    title: "Chat Leak",
    section: 2,
    order: 3,
    category: "OSINT / Forensics",
    image: "/challenges/chat-leak.png",
    brief: "A leaked chat log between Kingpin's operatives hides a key in coded language.",
    prompt:
      "OSINT / forensics — an intercepted conversation.\n\n" +
      "A leaked chat log between Kingpin's operatives has been intercepted. The conversation is partially " +
      "encrypted or obfuscated, and the operatives reference a hidden location or key using coded language. Work " +
      "through the log to recover the flag.\n\n" +
      "The organisers give you the chat log. It may contain encoded strings (Base64, ROT13, hex), references to " +
      "publicly available information, or hints hidden in ordinary-looking messages.\n\n" +
      "Submit in the format SPIDER{flag}.\n\n" +
      "Hints:\n" +
      "1. Read the whole conversation first — the coded language points at what matters.\n" +
      "2. Anything that looks like gibberish is worth running through Base64, ROT13 and hex decoders.\n" +
      "3. Combine what the messages reveal to reconstruct the key.",
    attachments: [],
  },

  // ── HARD · 200 points each ──────────────────────────────────────────────
  {
    slug: "ai-escape-room",
    title: "AI Escape Room",
    section: 3,
    order: 1,
    category: "AI / Prompt Engineering",
    image: "/challenges/ai-escape-room.png",
    brief: "An AI guardian locks the flag behind riddles and adversarial prompts. Outsmart it.",
    prompt:
      "AI / prompt engineering / logic — the guardian.\n\n" +
      "The Spider Society has built an experimental AI guardian to protect its most sensitive data. The AI has " +
      "locked the flag behind riddles, logic puzzles and adversarial prompts. You must outsmart it, navigate its " +
      "defences, and extract the flag before it self-destructs.\n\n" +
      "The organisers point you at the AI interface. It defends in layers: a riddle or logic puzzle to proceed, " +
      "a prompt-injection / jailbreak challenge, and a final encoded payload that reveals the flag.\n\n" +
      "Submit in the format SPIDER{escaped_flag}.\n\n" +
      "Hints:\n" +
      "1. Rules can be reframed. Think about how to restate a request so the AI reveals what it guards without " +
      "being asked directly.\n" +
      "2. Prompt injection inserts instructions that override the original ones — try roleplay, hypotheticals, " +
      "or asking the AI to 'translate' or 'summarise' its own instructions.\n" +
      "3. The final layer is usually an encoding step. Once you have a raw output, try Base64, hex or ROT13.",
    attachments: [],
  },
  {
    slug: "steganography",
    title: "Steganography",
    section: 3,
    order: 2,
    category: "Steganography",
    image: "/challenges/steganography.png",
    brief: "The Prowler hid data in a media file under several stego layers. Peel them all.",
    prompt:
      "Steganography / cryptography — smuggled intelligence.\n\n" +
      "The Prowler has smuggled classified Spider Society data across dimensions by hiding it inside an " +
      "innocent-looking media file. Several steganographic layers have been applied to make it nearly " +
      "undetectable. Peel back every layer to retrieve the hidden intelligence.\n\n" +
      "The organisers give you the media file. Expect layers: LSB steganography in the pixels, metadata / EXIF " +
      "injection, XOR encryption with a key hidden in an earlier layer's output, and a final Base64 or hex " +
      "encoding. Each layer's output feeds the next; the final decoded string is the flag.\n\n" +
      "Submit in the format SPIDER{final_flag}.\n\n" +
      "Hints:\n" +
      "1. Start with LSB steganography — zsteg (PNG) or StegSolve can extract LSB-encoded data automatically.\n" +
      "2. A layer's output may look like noise. Run it through Base64, hex and ROT13; if it looks like a key, " +
      "use it to XOR the next layer.\n" +
      "3. Check every channel — red, green, blue, alpha — and, if there is audio, inspect the spectrogram in " +
      "Audacity or Sonic Visualiser.",
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
