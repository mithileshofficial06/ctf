import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeOwnsBlob } from "./attachments";
import type { Challenge } from "@/lib/db/types";

function challenge(slug: string, attachments: string[]): Challenge {
  return {
    type: "ctf",
    slug,
    title: slug,
    points: 100,
    opensAt: null,
    closesAt: null,
    config: { attachments },
  };
}

const alpha = challenge("alpha", ["alpha/evidence.img", "alpha/notes.txt"]);
const beta = challenge("beta", ["beta/binary"]);

test("a challenge owns the blobs listed on it", () => {
  assert.equal(challengeOwnsBlob(alpha, "alpha/evidence.img"), true);
  assert.equal(challengeOwnsBlob(alpha, "alpha/notes.txt"), true);
});

test("one challenge's blob cannot be fetched via another's slug", () => {
  // Without this check the `name` parameter is a read primitive for the whole
  // container — ask for any challenge you can see, name any blob you can guess.
  assert.equal(challengeOwnsBlob(beta, "alpha/evidence.img"), false);
  assert.equal(challengeOwnsBlob(alpha, "beta/binary"), false);
});

test("a challenge with no attachments owns nothing", () => {
  assert.equal(challengeOwnsBlob(challenge("empty", []), "alpha/evidence.img"), false);
  const undeclared = challenge("none", []);
  delete undeclared.config.attachments;
  assert.equal(challengeOwnsBlob(undeclared, "anything"), false);
});

test("matching is exact — no prefix or traversal leniency", () => {
  assert.equal(challengeOwnsBlob(alpha, "alpha/"), false);
  assert.equal(challengeOwnsBlob(alpha, "alpha"), false);
  assert.equal(challengeOwnsBlob(alpha, "alpha/evidence.img/../../beta/binary"), false);
  assert.equal(challengeOwnsBlob(alpha, "../alpha/evidence.img"), false);
  assert.equal(challengeOwnsBlob(alpha, "ALPHA/EVIDENCE.IMG"), false);
});
