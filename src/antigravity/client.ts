import {
  ANTIGRAVITY_ENDPOINTS,
  ANTIGRAVITY_ENDPOINT_PROD,
  type HeaderStyle,
  getRandomizedHeaders,
  resolveModelForHeaderStyle,
  isClaudeModel,
} from './types.ts';
import { getFingerprintHeaders } from './fingerprint.ts';

interface RequestOptions {
  headerStyle?: HeaderStyle;
  refreshToken?: string;
}

/**
 * Sleeps for the given number of milliseconds.
 * @param ms - Duration in milliseconds.
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses the error reason from a response body without consuming the stream.
 * @param response - The HTTP response to inspect.
 * @returns The error reason string, or null if unknown.
 */
async function parseErrorReason(response: Response): Promise<string | null> {
  try {
    const text = await response.clone().text();
    if (text.includes("RESOURCE_EXHAUSTED") || text.includes("MODEL_CAPACITY_EXHAUSTED")) {
      return "MODEL_CAPACITY_EXHAUSTED";
    }
    if (text.includes("INTERNAL") || text.includes("SERVER_ERROR")) {
      return "SERVER_ERROR";
    }
  } catch {
    // ignore
  }
  return null;
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
 * for capacity errors. Falls back to gemini-cli style for non-Claude models
 * when all antigravity endpoints are exhausted.
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
  const model = payload.model as string;

  const endpoints = style === "gemini-cli"
    ? [ANTIGRAVITY_ENDPOINT_PROD]
    : ANTIGRAVITY_ENDPOINTS;

  let lastError: string | undefined;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    let capacityRetryCount = 0;

    while (capacityRetryCount < 5) {
      const url = `${endpoint}/v1internal:streamGenerateContent?alt=sse`;

      const styleHeaders = getRandomizedHeaders(style);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
        ...styleHeaders,
      };

      if (style === "antigravity") {
        delete headers['x-goog-user-project'];
        if (options.refreshToken) {
          const fingerprint = await getFingerprintHeaders(options.refreshToken);
          headers["X-Goog-QuotaUser"] = fingerprint["X-Goog-QuotaUser"];
          headers["X-Client-Device-Id"] = fingerprint["X-Client-Device-Id"];
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return response;
      }

      if (response.status === 429 || response.status === 503) {
        const reason = await parseErrorReason(response);

        if ((reason === "MODEL_CAPACITY_EXHAUSTED" || reason === "SERVER_ERROR") && capacityRetryCount < 4) {
          const baseDelayMs = 1000;
          const maxDelayMs = 8000;
          const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, capacityRetryCount), maxDelayMs);
          const jitter = Math.floor(Math.random() * 500);
          const waitMs = exponentialDelay + jitter;

          console.warn(`[Client] Server busy (${reason}) on ${endpoint}, exponential backoff ${waitMs}ms (attempt ${capacityRetryCount + 1})`);
          await safeDiscardBody(response);
          await sleep(waitMs);

          capacityRetryCount++;
          continue;
        }

        await safeDiscardBody(response);
        break;
      }

      const errorText = await response.text();
      lastError = `Antigravity API error (${response.status}): ${errorText}`;

      if (i < endpoints.length - 1) {
        console.warn(`[Client] Endpoint ${endpoint} returned ${response.status}, trying next...`);
        break;
      }

      if (style === "antigravity" && !isClaudeModel(model)) {
        console.warn(`[Client] Endpoint ${endpoint} returned ${response.status}, will try Gemini CLI fallback...`);
        break;
      }

      throw new Error(lastError);
    }
  }

  if (style === "antigravity" && !isClaudeModel(model)) {
    console.warn('[Client] All antigravity endpoints exhausted, trying Gemini CLI fallback...');

    const cliModel = resolveModelForHeaderStyle(model, "gemini-cli");
    const { requestType: _, userAgent: _ua, requestId: _rid, ...cleanPayload } = payload;
    const cliPayload = { ...cleanPayload, model: cliModel };

    return makeAntigravityRequest(cliPayload, accessToken, {
      ...options,
      headerStyle: "gemini-cli",
    });
  }

  throw new Error(lastError ?? `All endpoints exhausted for ${style} style`);
}
