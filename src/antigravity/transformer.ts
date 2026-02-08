import type {
  GeminiContent,
  GeminiContentPart,
  OpenAIMessage,
  OpenAITool,
} from './types.ts';
import { SKIP_THOUGHT_SIGNATURE, isClaudeModel } from './types.ts';
import { cleanJsonSchema, cleanJSONSchemaForAntigravity } from './schemaCleanup.ts';

/**
 * Converts OpenAI messages to Gemini format.
 *
 * @param messages - Array of OpenAI messages.
 * @returns Object with systemInstruction and Gemini contents.
 */
export function toGeminiFormat(
  messages: OpenAIMessage[],
): { systemInstruction?: string; contents: GeminiContent[] } {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];
  const pendingCallIdsByName = new Map<string, string[]>();

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = typeof msg.content === 'string' ? msg.content : '';
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const parts: GeminiContentPart[] = [];

      if (msg.content && typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      }

      for (const call of msg.tool_calls) {
        const callId = call.id || `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
        const callName = call.function?.name || 'unknown';
        const callArgs = call.function?.arguments || '{}';

        const queue = pendingCallIdsByName.get(callName) || [];
        queue.push(callId);
        pendingCallIdsByName.set(callName, queue);

        parts.push({
          functionCall: {
            id: callId,
            name: callName,
            args: typeof callArgs === 'string' ? safeJsonParse(callArgs) : callArgs,
          },
          thoughtSignature: SKIP_THOUGHT_SIGNATURE,
        });
      }

      contents.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === 'tool') {
      const toolName = msg.name || 'unknown';
      const queue = pendingCallIdsByName.get(toolName);
      const matchedId = msg.tool_call_id || (queue && queue.length > 0 ? queue.shift() : undefined);

      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            id: matchedId || 'unknown',
            name: toolName,
            response: { result: msg.content },
          },
        }],
      });
      continue;
    }

    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiContentPart[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text' && item.text) {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url' && item.image_url) {
          const url = typeof item.image_url === 'string' ? item.image_url : item.image_url.url;
          const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return { systemInstruction, contents };
}

/**
 * Converts OpenAI tools to Gemini function declarations.
 *
 * @param tools - Array of OpenAI tools.
 * @param model - Model name to determine schema cleanup strategy.
 * @returns Array of Gemini tool configurations.
 */
export function toGeminiTools(
  tools: OpenAITool[],
  model: string,
): Array<{ functionDeclarations: Array<{ name: string; description: string; parameters: Record<string, unknown> }> }> {
  const claude = isClaudeModel(model);

  return [{
    functionDeclarations: tools.map((tool) => {
      const params = tool.function?.parameters || {};
      const cleanedParams = claude
        ? cleanJSONSchemaForAntigravity(params)
        : cleanJsonSchema(typeof params === 'object' ? params : {});

      return {
        name: tool.function?.name || 'unknown',
        description: tool.function?.description || '',
        parameters: cleanedParams,
      };
    }),
  }];
}

/**
 * Safely parses JSON string or returns empty object if fails.
 *
 * @param text - JSON string to parse.
 * @returns Parsed object or empty object.
 */
function safeJsonParse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
