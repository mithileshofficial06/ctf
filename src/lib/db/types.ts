import type { ObjectId } from "mongodb";
import type { EventKey, SubmissionStatus } from "@/lib/config";

/**
 * Collection shapes. Cosmos DB for MongoDB (vCore free tier) — chosen over
 * Postgres because a Burstable Postgres tier caps around 30–50 connections,
 * which a 500-person burst walks straight into. Mongo handles hundreds.
 */

/**
 * A team.
 *
 * `name` carries a UNIQUE index, which is what makes the open join safe to
 * race: two people typing the same name in the same instant means one insert
 * wins and the other gets a duplicate-key error to show as "that name is
 * taken". Checking first and inserting second would let both through.
 */
export interface Team {
  _id?: ObjectId;
  name: string;
  /** Case- and space-insensitive form of `name`; the uniqueness is on this. */
  nameKey: string;
  createdAt: Date;
  /**
   * ctf: when this team pressed Start. Null until they do.
   *
   * The clock is PER TEAM, not shared, so a team that joins ten minutes late is
   * not ten minutes behind — their elapsed time is measured from here. Written
   * exactly once, by a conditional update that only matches while it is null,
   * so a double-click cannot restart anybody's run.
   */
  startedAt?: Date | null;
}

export interface Participant {
  _id?: ObjectId;
  teamId: ObjectId;
  name: string;
  role: "participant" | "admin";
  createdAt: Date;
}

/**
 * Pre-issued entry codes. We store ONLY the hash — a leaked database dump
 * must not hand someone a working set of codes.
 */
export interface AccessCode {
  _id?: ObjectId;
  codeHash: string; // sha256(code), indexed
  teamId: ObjectId;
  participantId: ObjectId;
  role: "participant" | "admin";
  redeemedAt: Date | null;
}

/**
 * A challenge in any event. `config` is the per-event payload — deliberately
 * loose, because a quiz question and a code problem share nothing structurally.
 * Answers/flags live here HASHED, never in plaintext.
 */
export interface Challenge {
  _id?: ObjectId;
  type: EventKey;
  slug: string;
  title: string;
  points: number;
  opensAt: Date | null;
  closesAt: Date | null;
  config: {
    /** hunt + ctf: sha256 of the accepted answer/flag. */
    answerHash?: string;
    /** hunt: the next clue unlocked by solving this one. */
    nextSlug?: string;
    /** hunt: point cost of each hint, in order. */
    hintCosts?: number[];
    /** quiz: option index that scores. */
    correctIndex?: number;
    /** quiz: seconds allowed from serve to answer. */
    limitSeconds?: number;
    /** quiz: bonus for answering fast, scaled by time remaining. */
    speedBonus?: number;
    /**
     * ctf: which difficulty section this belongs to (1 easy, 2 medium, 3 hard)
     * and its position within it. `order` is DISPLAY ORDER — nothing unlocks.
     * Points come from the section, not from the challenge document — see
     * lib/ctf/sections.ts.
     */
    section?: number;
    order?: number;
    /**
     * ctf: blob names of downloadable files, NOT URLs. A stored URL either
     * expires or never expires; both are wrong. The name is stable and the
     * signed URL is minted per request with a short expiry.
     */
    attachments?: string[];
    /** code: reference to the hidden test bundle in blob storage. */
    testsRef?: string;
  };
}

export interface Submission {
  _id?: ObjectId;
  type: EventKey;
  challengeId: ObjectId;
  teamId: ObjectId;
  participantId: ObjectId;
  /**
   * SERVER clock, stamped the moment the request is accepted. This is the
   * fairness anchor: ties, first-blood and quiz time limits all resolve
   * against it, never against a client-supplied time.
   */
  receivedAt: Date;
  /** Inline answer for sync events; blob reference for code submissions. */
  payload?: string;
  payloadRef?: string;
  status: SubmissionStatus;
  verdict?: {
    correct: boolean;
    points: number;
    meta?: Record<string, unknown>;
  };
}

/**
 * Append-only score ledger. Never updated, never deleted — the leaderboard is
 * derived from it. That means a scoring bug can be corrected by appending a
 * compensating row, and the history stays auditable for disputes.
 */
export interface ScoreEvent {
  _id?: ObjectId;
  teamId: ObjectId;
  event: EventKey;
  points: number;
  reason: string;
  submissionId?: ObjectId;
  at: Date;
}

/** Server-side gate for the hunt's clue chain — clients can't skip ahead. */
export interface HuntProgress {
  _id?: ObjectId;
  teamId: ObjectId;
  challengeSlug: string;
  unlockedAt: Date;
  solvedAt: Date | null;
  hintsUsed: number;
}

/** One doc per event, overwritten by the materializer. */
export interface LeaderboardSnapshot {
  _id?: ObjectId;
  event: EventKey | "overall";
  generatedAt: Date;
  rows: Array<{
    teamId: string;
    teamName: string;
    points: number;
    lastScoreAt: Date | null;
    /**
     * ctf only. How many questions the team has solved and how long their run
     * took, so equal scores can be separated by speed. Optional because the
     * other three events have no such notion — their rows are unchanged.
     */
    solved?: number;
    elapsedMs?: number | null;
    finished?: boolean;
  }>;
}
