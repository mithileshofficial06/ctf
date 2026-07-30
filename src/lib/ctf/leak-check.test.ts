import { test } from "node:test";
import assert from "node:assert/strict";
import { findLeaks, leakNeedles, normalise } from "./leak-check";
import { CTF_CHALLENGES } from "./content";
import { CTF_FLAGS } from "./content.server";

const FLAGS = { demo: "flag{s3cret_value}" };

test("a clean document reports no leak", () => {
  const doc = {
    slug: "demo",
    title: "Demo",
    config: { answerHash: "a".repeat(64), category: "web" },
  };
  assert.deepEqual(findLeaks(doc, FLAGS), []);
});

// ── The four shapes a real leak has actually taken on this platform ────────

test("catches a flag sitting in a config field", () => {
  const doc = { slug: "demo", config: { answerHash: "x", hint: "flag{s3cret_value}" } };
  assert.deepEqual(findLeaks(doc, FLAGS), ["demo"]);
});

test("catches a slug named after the answer", () => {
  const doc = { slug: "flag-s3cret-value", config: {} };
  assert.deepEqual(findLeaks(doc, FLAGS), ["demo"]);
});

test("catches a filename that contains the answer", () => {
  const doc = { slug: "demo", config: { attachments: ["flag_s3cret_value.txt"] } };
  assert.deepEqual(findLeaks(doc, FLAGS), ["demo"]);
});

test("catches a word list where one entry happens to be the answer", () => {
  const doc = { slug: "demo", config: { words: ["alpha", "flag{s3cret_value}", "beta"] } };
  assert.deepEqual(findLeaks(doc, FLAGS), ["demo"]);
});

test("catches short fragments in an array that join back into the flag", () => {
  // The one that gets missed by a plain substring search: no single entry is
  // the flag, but stripping JSON's punctuation joins them.
  const doc = { slug: "demo", config: { parts: ["fl", "ag", "s3", "cr", "et", "va", "lue"] } };
  assert.deepEqual(findLeaks(doc, FLAGS), ["demo"]);
});

test("normalise makes differently-punctuated forms identical", () => {
  assert.equal(normalise("flag{s3cret_value}"), normalise("FLAG - S3CRET - VALUE"));
});

// ── The wrapper is public, so the inside alone is a full leak ──────────────

test("catches the inner payload leaked WITHOUT the flag{} wrapper", () => {
  // Everyone knows the format. "the answer is s3cret_value" gives it away as
  // completely as printing the whole flag.
  const doc = { slug: "demo", config: { prompt: "the answer is s3cret_value" } };
  assert.deepEqual(findLeaks(doc, FLAGS), ["demo"]);
});

test("catches inner-payload fragments that join back together", () => {
  const doc = { slug: "demo", config: { parts: ["s3", "cr", "et", "_va", "lue"] } };
  assert.deepEqual(findLeaks(doc, FLAGS), ["demo"]);
});

test("leakNeedles yields both the whole flag and its inner payload", () => {
  assert.deepEqual(leakNeedles("flag{s3cret_value}"), ["flags3cretvalue", "s3cretvalue"]);
});

test("a too-short inner payload is not searched for on its own", () => {
  // "abc" would fire on ordinary prose; only the full flag is used.
  assert.deepEqual(leakNeedles("flag{abc}"), ["flagabc"]);
});

test("thematically similar prose is NOT a false positive", () => {
  // The prompt may hint at the technique without containing the answer.
  const doc = { config: { prompt: "Never trust the client." } };
  assert.deepEqual(findLeaks(doc, { demo: "flag{n3ver_trust_the_client}" }), []);
});

test("reports every leaked slug, not just the first", () => {
  const flags = { a: "flag{aaa_one}", b: "flag{bbb_two}" };
  const doc = { note: "flag{aaa_one} and flag{bbb_two}" };
  assert.deepEqual(findLeaks(doc, flags).sort(), ["a", "b"]);
});

// ── The real content, checked the same way ─────────────────────────────────

test("the shipped CTF content leaks no flag through slug, title, prompt or filename", () => {
  // This is the check that matters: it runs against the actual challenges,
  // not a fixture, so writing a careless slug fails the test suite.
  assert.deepEqual(findLeaks(CTF_CHALLENGES, CTF_FLAGS), []);
});

test("every shipped challenge has a distinct flag", () => {
  const flags = Object.values(CTF_FLAGS);
  assert.equal(new Set(flags).size, flags.length, "two challenges share a flag");
});
