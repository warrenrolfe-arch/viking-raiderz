import { HALL_CHIEFS, isHallCountryCode } from "../../src/hallOfLegends";
import type { PlayerId } from "../../src/types";

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>;
}

interface HallEnvironment {
  HALL_DB?: D1Database;
  TURNSTILE_SECRET?: string;
}

interface HallContext {
  request: Request;
  env: HallEnvironment;
}

interface StoredHallEntry {
  id: number;
  submission_id: string;
  initials: string;
  country_code: string;
  chief_id: PlayerId;
  turns: number;
  created_at: number;
}

interface TurnstileResult {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

const PLAYER_IDS = new Set<PlayerId>(["blue", "red", "pink", "green"]);
const ONE_DAY_MS = 86_400_000;
const MAX_SUBMISSIONS_PER_DAY = 5;

function json(data: unknown, status = 200, cacheControl = "no-store"): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function database(context: HallContext): D1Database | undefined {
  return context.env.HALL_DB;
}

function publicEntry(row: StoredHallEntry, rank: number) {
  return {
    rank,
    initials: row.initials,
    countryCode: row.country_code,
    chiefId: row.chief_id,
    chief: HALL_CHIEFS[row.chief_id],
    turns: row.turns,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function topEntries(db: D1Database): Promise<StoredHallEntry[]> {
  const result = await db.prepare(`
    SELECT id, submission_id, initials, country_code, chief_id, turns, created_at
    FROM hall_entries
    ORDER BY turns ASC, created_at ASC, id ASC
    LIMIT 40
  `).all<StoredHallEntry>();
  return result.results ?? [];
}

async function sourceHash(request: Request, secret: string): Promise<string> {
  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const bytes = new TextEncoder().encode(`${secret}|hall-rate-limit|${address}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateTurnstile(request: Request, secret: string, token: string): Promise<boolean> {
  const formData = new FormData();
  formData.set("secret", secret);
  formData.set("response", token);
  const address = request.headers.get("CF-Connecting-IP");
  if (address) formData.set("remoteip", address);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) return false;
  const result = await response.json() as TurnstileResult;
  return result.success === true && result.action === "hall-submit";
}

function validProof(value: unknown): value is {
  challengeVersion: 1;
  winnerId: PlayerId;
  completedTurns: number;
  round: number;
  matchSeed: number;
  eventCardFrequency: "every-two-turns";
  winterEnabled: true;
  controllers: Array<{ id: PlayerId; controller: "human" | "expert" }>;
} {
  if (!value || typeof value !== "object") return false;
  const proof = value as Record<string, unknown>;
  if (
    proof.challengeVersion !== 1 ||
    typeof proof.winnerId !== "string" ||
    !PLAYER_IDS.has(proof.winnerId as PlayerId) ||
    proof.eventCardFrequency !== "every-two-turns" ||
    proof.winterEnabled !== true ||
    !Number.isInteger(proof.completedTurns) ||
    (proof.completedTurns as number) < 1 ||
    (proof.completedTurns as number) > 10_000 ||
    !Number.isInteger(proof.round) ||
    (proof.round as number) < 1 ||
    (proof.round as number) > 1_000 ||
    !Number.isInteger(proof.matchSeed) ||
    !Array.isArray(proof.controllers) ||
    proof.controllers.length !== 4
  ) return false;

  const seen = new Set<PlayerId>();
  let humans = 0;
  for (const candidate of proof.controllers) {
    if (!candidate || typeof candidate !== "object") return false;
    const controller = candidate as Record<string, unknown>;
    if (typeof controller.id !== "string" || !PLAYER_IDS.has(controller.id as PlayerId)) return false;
    if (seen.has(controller.id as PlayerId)) return false;
    seen.add(controller.id as PlayerId);
    if (controller.controller === "human") {
      humans += 1;
      if (controller.id !== proof.winnerId) return false;
    } else if (controller.controller !== "expert") return false;
  }
  return humans === 1 && seen.size === 4;
}

export async function onRequestGet(context: HallContext): Promise<Response> {
  const db = database(context);
  if (!db) return json({ error: "The Hall database has not been connected yet." }, 503);
  try {
    const entries = await topEntries(db);
    return json({ entries: entries.map((entry, index) => publicEntry(entry, index + 1)) }, 200, "public, max-age=30");
  } catch {
    return json({ error: "The Hall doors are stuck. Please try again shortly." }, 503);
  }
}

export async function onRequestPost(context: HallContext): Promise<Response> {
  const db = database(context);
  const secret = context.env.TURNSTILE_SECRET;
  if (!db || !secret) return json({ error: "The Hall is not fully connected yet." }, 503);

  const requestUrl = new URL(context.request.url);
  const origin = context.request.headers.get("Origin");
  if (origin && new URL(origin).host !== requestUrl.host) return json({ error: "Cross-fjord submissions are not accepted." }, 403);

  const declaredLength = Number(context.request.headers.get("Content-Length") ?? 0);
  if (declaredLength > 12_000) return json({ error: "That saga is far too large." }, 413);

  let body: Record<string, unknown>;
  try {
    body = await context.request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "The Hall could not read that entry." }, 400);
  }

  const initials = typeof body.initials === "string" ? body.initials.trim().toUpperCase() : "";
  const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
  const chiefId = typeof body.chiefId === "string" ? body.chiefId as PlayerId : undefined;
  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";

  if (!/^[A-Z]{3}$/.test(initials)) return json({ error: "Initials must be exactly three letters." }, 400);
  if (!isHallCountryCode(countryCode)) return json({ error: "Choose a recognised country or territory." }, 400);
  if (!chiefId || !PLAYER_IDS.has(chiefId)) return json({ error: "That chief is unknown to the skald." }, 400);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    return json({ error: "The battle record is missing its seal." }, 400);
  }
  const proof = body.proof;
  if (!validProof(proof) || proof.winnerId !== chiefId) {
    return json({ error: "This battle does not meet the Hall of Legends challenge." }, 400);
  }

  const source = await sourceHash(context.request, secret);
  const now = Date.now();
  try {
    await db.prepare("DELETE FROM hall_rate_limits WHERE submitted_at < ?").bind(now - ONE_DAY_MS).run();
    const recent = await db.prepare(
      "SELECT COUNT(*) AS count FROM hall_rate_limits WHERE source_hash = ? AND submitted_at >= ?",
    ).bind(source, now - ONE_DAY_MS).first<{ count: number }>();
    if ((recent?.count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
      return json({ error: "This longhouse has recorded enough legends from you today. Please return tomorrow." }, 429);
    }
  } catch {
    return json({ error: "The Hall record keeper is temporarily unavailable." }, 503);
  }

  if (!turnstileToken || !await validateTurnstile(context.request, secret, turnstileToken)) {
    return json({ error: "The anti-bot rune could not be verified. Please try again." }, 400);
  }

  const existing = await db.prepare(`
    SELECT id, submission_id, initials, country_code, chief_id, turns, created_at
    FROM hall_entries WHERE submission_id = ?
  `).bind(submissionId).first<StoredHallEntry>();
  if (existing) {
    const entries = await topEntries(db);
    const rank = entries.findIndex((entry) => entry.id === existing.id) + 1;
    return json({ placed: rank > 0, entry: rank > 0 ? publicEntry(existing, rank) : undefined });
  }

  try {
    await db.batch([
      db.prepare(`
        INSERT INTO hall_entries (submission_id, initials, country_code, chief_id, turns, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(submissionId, initials, countryCode, chiefId, proof.completedTurns, now),
      db.prepare("INSERT INTO hall_rate_limits (source_hash, submitted_at) VALUES (?, ?)").bind(source, now),
    ]);
    await db.prepare(`
      DELETE FROM hall_entries
      WHERE id NOT IN (
        SELECT id FROM hall_entries ORDER BY turns ASC, created_at ASC, id ASC LIMIT 40
      )
    `).run();
  } catch {
    return json({ error: "The skald dropped the entry tablet. Please try once more." }, 503);
  }

  const entries = await topEntries(db);
  const rank = entries.findIndex((entry) => entry.submission_id === submissionId) + 1;
  const entry = rank > 0 ? entries[rank - 1] : undefined;
  return json({
    placed: Boolean(entry),
    entry: entry ? publicEntry(entry, rank) : undefined,
    message: entry
      ? `Your legend enters the Hall at rank ${rank}.`
      : "A worthy victory, but it did not displace the current forty legends.",
  }, 201);
}
