import { ANTIGRAVITY_ENDPOINTS } from './types.ts';
import { ENV } from '../util/env.ts';
import { evictFingerprint, clearFingerprintCache } from './fingerprint.ts';

interface TokenEntry {
  accessToken: string;
  expiresAt: number;
  projectId?: string;
  lastAccessedAt: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  refreshes: number;
  evictedByCleanup: number;
  evictedByLRU: number;
}

const MAX_CACHE_SIZE = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const tokenCache = new Map<string, TokenEntry>();
const refreshPromises = new Map<string, Promise<string>>();
const cacheMetrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  refreshes: 0,
  evictedByCleanup: 0,
  evictedByLRU: 0,
};

let cleanupTimer: number | undefined;

function cleanupExpiredEntries(): void {
  const now = Date.now();
  const initialSize = tokenCache.size;

  for (const [key, entry] of tokenCache.entries()) {
    if (entry.expiresAt < now) {
      tokenCache.delete(key);
      evictFingerprint(key);
      cacheMetrics.evictedByCleanup++;
    }
  }

  const removed = initialSize - tokenCache.size;
  if (removed > 0) {
    console.log(`[OAuth] Cleanup: removed ${removed} expired entries`);
  }
}

function evictLRUIfNeeded(): void {
  if (tokenCache.size <= MAX_CACHE_SIZE) return;

  const entries = Array.from(tokenCache.entries());
  entries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

  const toRemove = entries.slice(0, tokenCache.size - MAX_CACHE_SIZE);
  for (const [key] of toRemove) {
    tokenCache.delete(key);
    evictFingerprint(key);
    cacheMetrics.evictedByLRU++;
  }

  console.log(`[OAuth] LRU eviction: removed ${toRemove.length} entries`);
}

function getCacheMetrics(): Readonly<CacheMetrics> {
  return { ...cacheMetrics };
}

function startCleanupTimer(): void {
  if (cleanupTimer !== undefined) return;

  cleanupTimer = setInterval(() => {
    cleanupExpiredEntries();
  }, CLEANUP_INTERVAL_MS);

  console.log(`[OAuth] Cleanup timer started (interval: ${CLEANUP_INTERVAL_MS}ms)`);
}

function stopCleanupTimer(): void {
  if (cleanupTimer !== undefined) {
    clearInterval(cleanupTimer);
    cleanupTimer = undefined;
  }
}

class OAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly type: 'invalid_token' | 'rate_limit' | 'network_error'
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ENV.clientId,
      client_secret: ENV.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const text = await response.text();

    if (status === 400 || status === 401) {
      tokenCache.delete(refreshToken);
      evictFingerprint(refreshToken);
      throw new OAuthError(
        `Invalid refresh token (${status}): ${text}`,
        status,
        'invalid_token'
      );
    }

    if (status === 429) {
      throw new OAuthError(
        `Rate limited (${status}): ${text}`,
        status,
        'rate_limit'
      );
    }

    throw new OAuthError(
      `Token refresh failed (${status}): ${text}`,
      status,
      'network_error'
    );
  }

  const data = await response.json();
  const accessToken = data.access_token;
  const expiresAt = Date.now() + (data.expires_in * 1000) - 60_000;
  const now = Date.now();

  const cached = tokenCache.get(refreshToken);
  if (cached) {
    cached.accessToken = accessToken;
    cached.expiresAt = expiresAt;
    cached.lastAccessedAt = now;
  } else {
    tokenCache.set(refreshToken, {
      accessToken,
      expiresAt,
      lastAccessedAt: now,
    });
  }

  cacheMetrics.refreshes++;
  return accessToken;
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  if (!refreshToken) {
    throw new Error('No refresh token provided');
  }

  if (cleanupTimer === undefined) {
    startCleanupTimer();
  }

  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now()) {
    cached.lastAccessedAt = Date.now();
    cacheMetrics.hits++;
    return cached.accessToken;
  }

  cacheMetrics.misses++;

  const existingPromise = refreshPromises.get(refreshToken);
  if (existingPromise) {
    console.log('[OAuth] Waiting for existing refresh promise');
    return existingPromise;
  }

  const refreshPromise = refreshAccessToken(refreshToken)
    .finally(() => {
      refreshPromises.delete(refreshToken);
    });

  refreshPromises.set(refreshToken, refreshPromise);

  evictLRUIfNeeded();

  return refreshPromise;
}

export function clearTokenCache(): void {
  tokenCache.clear();
  refreshPromises.clear();
  clearFingerprintCache();
  cacheMetrics.hits = 0;
  cacheMetrics.misses = 0;
  cacheMetrics.refreshes = 0;
  cacheMetrics.evictedByCleanup = 0;
  cacheMetrics.evictedByLRU = 0;
  stopCleanupTimer();
}

export function resetCleanupTimer(): void {
  stopCleanupTimer();
}

export { getCacheMetrics, stopCleanupTimer };

export async function getProjectId(refreshToken: string): Promise<string | undefined> {
  const cached = tokenCache.get(refreshToken);
  if (cached?.projectId) {
    cached.lastAccessedAt = Date.now();
    return cached.projectId;
  }

  const token = await getAccessToken(refreshToken);

  for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const projectId = typeof data.cloudaicompanionProject === 'string'
          ? data.cloudaicompanionProject
          : data.cloudaicompanionProject?.id;

        if (projectId) {
          const entry = tokenCache.get(refreshToken);
          if (entry) {
            entry.projectId = projectId;
            entry.lastAccessedAt = Date.now();
          }
          console.log(`[OAuth] Discovered project for token: ${projectId}`);
          return projectId;
        }
      } else {
        await res.body?.cancel();
      }
    } catch (e) {
      console.warn(`[OAuth] Discovery failed on ${endpoint}:`, e);
    }
  }

  return undefined;
}
