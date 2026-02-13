import {
  ANTIGRAVITY_ENDPOINTS,
  ANTIGRAVITY_ENDPOINT_PROD,
  type HeaderStyle,
  getRandomizedHeaders,
  resolveModelForHeaderStyle,
  isClaudeModel,
} from './types.ts';

interface RequestOptions {
  headerStyle?: HeaderStyle;
  refreshToken?: string;
}

/**
 * Sleeps for the given number of milliseconds.
 * @param ms - Duration in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface ErrorInfo {
  reason: string | null;
  retryAfterMs?: number;
}

/**
 * Parses the error reason from a response body without consuming the stream.
 * Also extracts google.rpc.RetryInfo if present to get server-suggested retry delay.
 * @param response - The HTTP response to inspect.
 * @returns ErrorInfo containing reason and optional retryAfterMs.
 */
async function parseErrorInfo(response: Response): Promise<ErrorInfo> {
  try {
    const text = await response.clone().text();
    let reason: string | null = null;

    if (text.includes("RESOURCE_EXHAUSTED") || text.includes("MODEL_CAPACITY_EXHAUSTED")) {
      reason = "MODEL_CAPACITY_EXHAUSTED";
    } else if (text.includes("INTERNAL") || text.includes("SERVER_ERROR")) {
      reason = "SERVER_ERROR";
    }

    let retryAfterMs: number | undefined;
    try {
      const data = JSON.parse(text);

      const retryInfo = data?.error?.details?.find(
        (d: unknown) => typeof d === 'object' && d !== null && '@type' in d && typeof d['@type'] === 'string' && d['@type'].includes('google.rpc.RetryInfo')
      );

      if (retryInfo && typeof retryInfo === 'object' && 'retryDelay' in retryInfo && typeof retryInfo.retryDelay === 'string') {
        const match = retryInfo.retryDelay.match(/^([\d.]+)s$/);
        if (match) {
          retryAfterMs = parseFloat(match[1]) * 1000;
        }
      }
    } catch {
      // JSON parse failed or structure unexpected - continue without retryAfterMs
    }

    return { reason, retryAfterMs };
  } catch {
    return { reason: null };
  }
}

/**
 * Safely discards the response body to free resources.
 * Handles the case where the body was already consumed by text()/json().
 * @param response - The HTTP response to discard.
 */
async function safeDiscardBody(response: Response): Promise<void> {
  try {
    if (response.body && !response.bodyUsed) {
      await response.body.cancel();
    }
  } catch {
    // ignore
  }
}

/**
 * Makes a request to the Antigravity API with endpoint failover and retry logic.
 *
 * Tries endpoints in order (daily → autopush → prod) with exponential backoff
 * for capacity errors. Falls back between styles for non-Claude models
 * when endpoints are exhausted.
 *
 * @param payload - The request body.
 * @param accessToken - OAuth2 access token.
 * @param options - Optional configuration for header style and fingerprint.
 * @returns The successful API response.
 */
export async function makeAntigravityRequest(
  payload: Record<string, unknown>,
  accessToken: string,
  options: RequestOptions = {},
): Promise<Response> {
  const style = options.headerStyle ?? "antigravity";
  const originalModel = payload.model as string;
  const resolvedModel = resolveModelForHeaderStyle(originalModel, style);
  
  const currentPayload = { ...payload, model: resolvedModel };

  const endpoints = style === "gemini-cli"
    ? [ANTIGRAVITY_ENDPOINT_PROD]
    : ANTIGRAVITY_ENDPOINTS;

  let lastError: string | undefined;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    let capacityRetryCount = 0;
    const MAX_CAPACITY_RETRIES = 3;

    while (capacityRetryCount < MAX_CAPACITY_RETRIES) {
      const url = `${endpoint}/v1internal:streamGenerateContent?alt=sse`;

      const styleHeaders = getRandomizedHeaders(style);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${accessToken}`,
        ...styleHeaders,
      };

      if (isClaudeModel(resolvedModel) && resolvedModel.toLowerCase().includes('thinking')) {
        headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
      }

      // For antigravity style, we already have only User-Agent from styleHeaders.
      // We do NOT add X-Goog-QuotaUser or X-Client-Device-Id.
      // Plugin reference only sends User-Agent for antigravity requests.
      if (style === "antigravity") {
        delete headers['x-goog-user-project'];
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(currentPayload),
      });

      if (response.ok) {
        return response;
      }

      if (response.status === 429 || response.status === 503) {
        const { reason, retryAfterMs } = await parseErrorInfo(response);

        if ((reason === "MODEL_CAPACITY_EXHAUSTED" || reason === "SERVER_ERROR") && capacityRetryCount < MAX_CAPACITY_RETRIES) {
          let waitMs: number;

          if (retryAfterMs !== undefined) {
            waitMs = retryAfterMs;
          } else {
            const baseMs = 5000 * Math.pow(2, capacityRetryCount);
            const jitter = Math.floor(Math.random() * 2000) - 1000;
            waitMs = Math.min(baseMs + jitter, 30000);
          }

          console.warn(`[Client] Server busy (${reason}) on ${endpoint}, backoff ${waitMs}ms (attempt ${capacityRetryCount + 1}/${MAX_CAPACITY_RETRIES})`);
          await safeDiscardBody(response);
          await sleep(waitMs);

          capacityRetryCount++;
          continue;
        }

        await safeDiscardBody(response);
        break;
      }

      if (response.status === 403) {
        const errorText = await response.text();
        lastError = `Antigravity API error (403): ${errorText}`;
        console.error(`[Client] Error on ${endpoint}:`, lastError);

        await safeDiscardBody(response);

        if (i < endpoints.length - 1) {
          console.warn(`[Client] Endpoint ${endpoint} returned 403, trying next...`);
          break;
        }

        if (!isClaudeModel(resolvedModel)) {
          console.warn(`[Client] Endpoint ${endpoint} returned 403, will try style fallback...`);
          break;
        }

        throw new Error(lastError);
      }

      const errorText = await response.text();
      lastError = `Antigravity API error (${response.status}): ${errorText}`;
      console.error(`[Client] Error on ${endpoint}:`, lastError);

      if (i < endpoints.length - 1) {
        console.warn(`[Client] Endpoint ${endpoint} returned ${response.status}, trying next...`);
        break;
      }

      if (!isClaudeModel(resolvedModel)) {
        console.warn(`[Client] Endpoint ${endpoint} returned ${response.status}, will try style fallback...`);
        break;
      }

      throw new Error(lastError);
    }
  }

  // Style fallback logic for Gemini models
  if (!isClaudeModel(resolvedModel)) {
    const nextStyle = style === "antigravity" ? "gemini-cli" : "antigravity";
    console.warn(`[Client] ${style} style exhausted or failed, trying ${nextStyle} fallback...`);
    
    try {
      return await makeAntigravityRequest(payload, accessToken, {
        ...options,
        headerStyle: nextStyle,
      });
    } catch (fallbackError) {
      console.warn(`[Client] ${nextStyle} fallback also failed:`, fallbackError);
      throw new Error(lastError ?? `All endpoints exhausted for both styles`);
    }
  }

  throw new Error(lastError ?? `All endpoints exhausted for ${style} style`);
}
