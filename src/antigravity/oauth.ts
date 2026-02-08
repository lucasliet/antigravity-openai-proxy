import { ANTIGRAVITY_ENDPOINTS } from './types.ts';
import { ENV } from '../util/env.ts';

interface TokenEntry {
  accessToken: string;
  expiresAt: number;
  projectId?: string;
}

const tokenCache = new Map<string, TokenEntry>();

/**
 * Retrieves a valid Google OAuth access token for a given refresh token, 
 * refreshing it if it's expired or about to expire.
 * Includes a 60-second buffer before actual expiration.
 *
 * @param refreshToken - The Google OAuth refresh token to use.
 * @returns A promise that resolves to a valid access token.
 * @throws Error if the refresh request fails.
 */
export async function getAccessToken(refreshToken: string): Promise<string> {
  if (!refreshToken) {
    throw new Error('No refresh token provided');
  }

  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

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
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const accessToken = data.access_token;
  const expiresAt = Date.now() + (data.expires_in * 1000) - 60_000;

  if (cached) {
    cached.accessToken = accessToken;
    cached.expiresAt = expiresAt;
  } else {
    tokenCache.set(refreshToken, { accessToken, expiresAt });
  }

  return accessToken;
}

/**
 * Retrieves the Antigravity project ID for a given refresh token. 
 * If not already cached, it attempts to discover it 
 * by calling an internal Antigravity endpoint.
 *
 * @param refreshToken - The Google OAuth refresh token.
 * @returns A promise that resolves to the Antigravity project ID or undefined if discovery fails.
 */
export async function getProjectId(refreshToken: string): Promise<string | undefined> {
  const cached = tokenCache.get(refreshToken);
  if (cached?.projectId) return cached.projectId;

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
          }
          console.log(`[OAuth] Discovered project for token: ${projectId}`);
          return projectId;
        }
      }
    } catch (e) {
      console.warn(`[OAuth] Discovery failed on ${endpoint}:`, e);
    }
  }

  return undefined;
}
