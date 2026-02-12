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
  capacityRetryCount?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    // ignore parse errors
  }
  return null;
}

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

      if (style === "antigravity" && options.refreshToken) {
        const fingerprint = await getFingerprintHeaders(options.refreshToken);
        headers["X-Goog-QuotaUser"] = fingerprint["X-Goog-QuotaUser"];
        headers["X-Client-Device-Id"] = fingerprint["X-Client-Device-Id"];
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

        if (reason === "MODEL_CAPACITY_EXHAUSTED" || reason === "SERVER_ERROR") {
          if (capacityRetryCount < 4) {
            const baseDelayMs = 1000;
            const maxDelayMs = 8000;
            const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, capacityRetryCount), maxDelayMs);
            const jitter = Math.floor(Math.random() * 500);
            const waitMs = exponentialDelay + jitter;

            console.warn(`[Client] Server busy (${reason}) on ${endpoint}, exponential backoff ${waitMs}ms (attempt ${capacityRetryCount + 1})`);
            await response.body?.cancel();
            await sleep(waitMs);

            capacityRetryCount++;
            continue;
          }
        }

        await response.body?.cancel();
        break;
      }

      if (response.status === 403) {
        const errorText = await response.text();
        if (errorText.includes("lack a Gemini Code Assist license") && i < endpoints.length - 1) {
          console.warn(`[Client] License error on ${endpoint}, trying next endpoint...`);
          await response.body?.cancel();
          break;
        }

        if (style === "antigravity" && !isClaudeModel(model) && i === endpoints.length - 1) {
          console.warn(`[Client] License error on ${endpoint}, will try Gemini CLI fallback...`);
          await response.body?.cancel();
          break;
        }

        throw new Error(`Antigravity API error (${response.status}): ${errorText}`);
      }

      if (!response.ok) {
        const errorText = await response.text();

        if (i < endpoints.length - 1) {
          console.warn(`[Client] Endpoint ${endpoint} returned ${response.status}, trying next...`);
          await response.body?.cancel();
          break;
        }

        if (style === "antigravity" && !isClaudeModel(model)) {
          console.warn(`[Client] Endpoint ${endpoint} returned ${response.status}, will try Gemini CLI fallback...`);
          await response.body?.cancel();
          break;
        }

        throw new Error(`Antigravity API error (${response.status}): ${errorText}`);
      }

      break;
    }
  }

  if (style === "antigravity" && !isClaudeModel(model)) {
    console.warn('[Client] All antigravity endpoints exhausted, trying Gemini CLI fallback...');

    const cliModel = resolveModelForHeaderStyle(model, "gemini-cli");
    const cliPayload = { ...payload, model: cliModel };

    return makeAntigravityRequest(cliPayload, accessToken, {
      ...options,
      headerStyle: "gemini-cli",
    });
  }

  throw new Error(`All endpoints exhausted for ${style} style`);
}
