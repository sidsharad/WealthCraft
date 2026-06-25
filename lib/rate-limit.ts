/**
 * lib/rate-limit.ts
 *
 * Two-layer in-memory rate limiting system:
 *
 * Layer 1 — Per-user/per-room throttle (checkRateLimit):
 *   - Key: `${userId}:${roomCode}` — limits per user per room.
 *   - Threshold: 2000ms (1 request per 2 seconds per user+room).
 *   - Strike tracking: after 10 strikes in 1 minute, escalates to 10s throttle.
 *   - Use in: GET /api/rooms
 *
 * Layer 2 — Global per-user circuit breaker (checkGlobalCircuitBreaker):
 *   - Key: `${userId}` — limits total requests across ALL endpoints.
 *   - Threshold: 100 requests per minute. Resets each minute.
 *   - Logs [GLOBAL_ABUSE_DETECTED] when tripped.
 *   - Use in: POST /api/rooms/[id]/action (and any future high-volume endpoint).
 *
 * Architecture:
 *   - Uses globalThis to share state across the same warm Vercel lambda container.
 *   - Resets on container recycle (acceptable — genuine loops hit the same warm container).
 *   - Stale entries pruned every 5 minutes to prevent memory leaks.
 */

// ─── LAYER 1 CONSTANTS (per-user/per-room) ────────────────────────────────────
const THROTTLE_MS = 2000;
const ABUSE_STRIKE_LIMIT = 10;
const ABUSE_WINDOW_MS = 60_000;
const ABUSE_THROTTLE_MS = 10_000;
const PRUNE_INTERVAL_MS = 300_000;

// ─── LAYER 2 CONSTANTS (global circuit breaker) ───────────────────────────────
const CIRCUIT_BREAKER_LIMIT = 100;   // Max requests per user per minute across all endpoints
const CIRCUIT_BREAKER_WINDOW = 60_000; // 1 minute rolling window

interface RateLimitEntry {
  lastRequest: number;
  strikes: number;
  windowStart: number;
  throttleMs: number;
}

interface CircuitBreakerEntry {
  count: number;
  windowStart: number;
}

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
declare global {
  var __rateLimitMap: Map<string, RateLimitEntry> | undefined;
  var __circuitBreakerMap: Map<string, CircuitBreakerEntry> | undefined;
  var __rateLimitPruneTimer: NodeJS.Timeout | undefined;
}

function getMap(): Map<string, RateLimitEntry> {
  if (!globalThis.__rateLimitMap) {
    globalThis.__rateLimitMap = new Map();
  }
  return globalThis.__rateLimitMap;
}

function getCircuitBreakerMap(): Map<string, CircuitBreakerEntry> {
  if (!globalThis.__circuitBreakerMap) {
    globalThis.__circuitBreakerMap = new Map();
  }
  return globalThis.__circuitBreakerMap;
}

function schedulePrune() {
  if (globalThis.__rateLimitPruneTimer) return;
  globalThis.__rateLimitPruneTimer = setInterval(() => {
    const now = Date.now();
    const cutoff = now - ABUSE_WINDOW_MS * 2;

    const map = getMap();
    for (const [key, entry] of map.entries()) {
      if (entry.lastRequest < cutoff) map.delete(key);
    }

    const cbMap = getCircuitBreakerMap();
    for (const [key, entry] of cbMap.entries()) {
      if (now - entry.windowStart > CIRCUIT_BREAKER_WINDOW * 2) cbMap.delete(key);
    }
  }, PRUNE_INTERVAL_MS);
}

// ─── EXPORTED TYPES ───────────────────────────────────────────────────────────
export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number; isAbuse: boolean };

// ─── LAYER 1: Per-user/per-room throttle ──────────────────────────────────────
/**
 * Check whether the given userId + roomCode is within the per-room rate limit.
 * Call this BEFORE any database query in GET /api/rooms.
 */
export function checkRateLimit(userId: string, roomCode: string): RateLimitResult {
  schedulePrune();

  const map = getMap();
  const key = `${userId}:${roomCode}`;
  const now = Date.now();
  const entry = map.get(key);

  if (!entry) {
    map.set(key, { lastRequest: now, strikes: 0, windowStart: now, throttleMs: THROTTLE_MS });
    return { allowed: true };
  }

  // Reset abuse window if expired
  if (now - entry.windowStart > ABUSE_WINDOW_MS) {
    entry.strikes = 0;
    entry.windowStart = now;
    entry.throttleMs = THROTTLE_MS;
  }

  const elapsed = now - entry.lastRequest;
  if (elapsed < entry.throttleMs) {
    entry.strikes++;
    if (entry.strikes >= ABUSE_STRIKE_LIMIT) {
      entry.throttleMs = ABUSE_THROTTLE_MS;
      console.warn(JSON.stringify({
        event: "ABUSE_DETECTED",
        userId,
        roomCode,
        strikes: entry.strikes,
        throttleMs: ABUSE_THROTTLE_MS,
        message: "Client rate-limited with escalated throttle due to repeated rapid requests."
      }));
    }
    return { allowed: false, retryAfterMs: entry.throttleMs - elapsed, isAbuse: entry.strikes >= ABUSE_STRIKE_LIMIT };
  }

  entry.lastRequest = now;
  map.set(key, entry);
  return { allowed: true };
}

// ─── LAYER 2: Global per-user circuit breaker ─────────────────────────────────
/**
 * Check whether the given userId has exceeded the global request ceiling.
 * Protects against future code paths that bypass the room-specific limiter.
 * Returns true if the circuit is OPEN (request should be blocked).
 *
 * @param userId  - The authenticated user's ID (from session).
 * @param endpoint - The endpoint being hit (for logging).
 */
export function checkGlobalCircuitBreaker(userId: string, endpoint: string): boolean {
  schedulePrune();

  const map = getCircuitBreakerMap();
  const now = Date.now();
  let entry = map.get(userId);

  if (!entry || now - entry.windowStart > CIRCUIT_BREAKER_WINDOW) {
    // Fresh window
    map.set(userId, { count: 1, windowStart: now });
    return false; // not tripped
  }

  entry.count++;

  if (entry.count > CIRCUIT_BREAKER_LIMIT) {
    // Only log once per window to avoid log spam
    if (entry.count === CIRCUIT_BREAKER_LIMIT + 1) {
      console.warn(JSON.stringify({
        event: "GLOBAL_ABUSE_DETECTED",
        userId,
        endpoint,
        requestsInWindow: entry.count,
        windowMs: CIRCUIT_BREAKER_WINDOW,
        limit: CIRCUIT_BREAKER_LIMIT,
        message: `User exceeded ${CIRCUIT_BREAKER_LIMIT} requests/minute across all endpoints.`
      }));
    }
    return true; // circuit OPEN — block request
  }

  return false; // allowed
}
