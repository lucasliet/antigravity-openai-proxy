import { ANTIGRAVITY_ENDPOINTS } from './types.ts';
import { getAccessToken } from './oauth.ts';

const HEADERS_BASE = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/1.16.5 Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata': JSON.stringify({ ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' }),
  'Accept': 'text/event-stream',
  'anthropic-beta': 'interleaved-thinking-2025-05-14',
} as const;

/**
 * Makes a request to the Antigravity API with endpoint fallback.
 *
 * @param payload - The request payload.
 * @param endpointIndex - Current endpoint index for retry logic.
 * @returns Promise resolving to the API response.
 */
export async function makeAntigravityRequest(
  payload: Record<string, unknown>,
  endpointIndex = 0,
): Promise<Response> {
  const accessToken = await getAccessToken();
  const endpoint = ANTIGRAVITY_ENDPOINTS[endpointIndex];
  const url = `${endpoint}/v1internal:streamGenerateContent?alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS_BASE,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if ((response.status === 429 || response.status >= 500) && endpointIndex < ANTIGRAVITY_ENDPOINTS.length - 1) {
    console.warn(`[Client] Endpoint ${endpoint} returned ${response.status}, trying next...`);
    return makeAntigravityRequest(payload, endpointIndex + 1);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Antigravity API error (${response.status}): ${errorText}`);
  }

  return response;
}
