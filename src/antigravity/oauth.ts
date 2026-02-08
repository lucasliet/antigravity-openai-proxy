import { ANTIGRAVITY_ENDPOINTS } from './types.ts';
import { ENV } from '../util/env.ts';

interface TokenState {
  accessToken: string;
  expiresAt: number;
  projectId: string;
}

const state: TokenState = {
  accessToken: '',
  expiresAt: 0,
  projectId: ENV.projectId,
};

/**
 * Retrieves a valid Google OAuth access token, refreshing it if it's expired or about to expire.
 * Includes a 60-second buffer before actual expiration.
 *
 * @returns A promise that resolves to a valid access token.
 * @throws Error if ANTIGRAVITY_REFRESH_TOKEN is not set or if the refresh request fails.
 */
export async function getAccessToken(): Promise<string> {
  if (!ENV.refreshToken) {
    throw new Error('ANTIGRAVITY_REFRESH_TOKEN is not set');
  }

  if (state.accessToken && state.expiresAt > Date.now()) {
    return state.accessToken;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ENV.clientId,
      client_secret: ENV.clientSecret,
      refresh_token: ENV.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  state.accessToken = data.access_token;
  state.expiresAt = Date.now() + (data.expires_in * 1000) - 60_000;

  return state.accessToken;
}

/**
 * Retrieves the Antigravity project ID. If not explicitly set in the environment,
 * it attempts to discover it by calling an internal Antigravity endpoint.
 *
 * @returns A promise that resolves to the Antigravity project ID.
 * @throws Error if discovery fails and no project ID is provided in the environment.
 */
export async function getProjectId(): Promise<string> {
  if (state.projectId) return state.projectId;

  const token = await getAccessToken();

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
          state.projectId = projectId;
          console.log(`[OAuth] Discovered project: ${projectId}`);
          return projectId;
        }
      }
    } catch (e) {
      console.warn(`[OAuth] Discovery failed on ${endpoint}:`, e);
    }
  }

  throw new Error('Could not discover Antigravity project ID. Set ANTIGRAVITY_PROJECT_ID env var.');
}
