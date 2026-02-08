import type { Context } from 'hono';
import type { AntigravityRequestPayload, OpenAIChatRequest } from '../antigravity/types.ts';
import {
  DEFAULT_THINKING_BUDGET,
  isClaudeModel,
  isThinkingCapableModel,
} from '../antigravity/types.ts';
import { toGeminiFormat, toGeminiTools } from '../antigravity/transformer.ts';
import { makeAntigravityRequest } from '../antigravity/client.ts';
import { getAccessToken, getProjectId } from '../antigravity/oauth.ts';
import { transformGeminiToOpenAIStream } from '../antigravity/streamTransformer.ts';

/**
 * Handles OpenAI-compatible chat completion requests.
 *
 * @param c - Hono context.
 * @returns Response object in OpenAI format.
 */
export async function chatCompletions(c: Context): Promise<Response> {
  const authHeader = c.req.header('Authorization') || '';
  const refreshToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!refreshToken) {
    return c.json({ error: { message: 'Missing API key (Authorization: Bearer <refresh_token>)' } }, 401);
  }

  let body: OpenAIChatRequest;
  try {
    body = await c.req.json<OpenAIChatRequest>();
  } catch {
    return c.json({ error: { message: 'Invalid JSON body' } }, 400);
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: { message: 'messages is required and must be a non-empty array' } }, 400);
  }

  const model = body.model || 'gemini-3-flash';
  const stream = body.stream !== false;
  const claude = isClaudeModel(model);
  const thinking = isThinkingCapableModel(model);

  try {
    const { systemInstruction, contents } = toGeminiFormat(body.messages);

    const tools = body.tools && body.tools.length > 0
      ? toGeminiTools(body.tools, model)
      : undefined;

    const generationConfig: Record<string, unknown> = {};
    if (body.max_tokens) generationConfig.maxOutputTokens = body.max_tokens;
    if (body.temperature !== undefined) generationConfig.temperature = body.temperature;
    if (body.top_p !== undefined) generationConfig.topP = body.top_p;
    if (body.stop) generationConfig.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];

    if (thinking && !claude) {
      generationConfig.thinkingConfig = {
        thinkingBudget: DEFAULT_THINKING_BUDGET,
        includeThoughts: true,
      };
    }

    const projectId = await getProjectId(refreshToken);
    const accessToken = await getAccessToken(refreshToken);

    const payload: AntigravityRequestPayload = {
      project: projectId,
      model,
      userAgent: 'antigravity',
      requestId: `req-${crypto.randomUUID()}`,
      requestType: 'agent',
      request: {
        contents,
        ...(tools ? { tools } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
        ...(thinking && claude ? {
          thinking: {
            type: 'enabled' as const,
            budgetTokens: DEFAULT_THINKING_BUDGET,
          },
        } : {}),
        ...(systemInstruction ? {
          systemInstruction: { role: 'user' as const, parts: [{ text: systemInstruction }] },
        } : {}),
      },
    };

    const response = await makeAntigravityRequest(payload as unknown as Record<string, unknown>, accessToken);

    if (!response.body) {
      return c.json({ error: { message: 'No response body from Antigravity' } }, 502);
    }

    if (stream) {
      return streamResponse(c, response.body, model);
    } else {
      return await nonStreamResponse(c, response.body, model);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ChatCompletions] Error:', msg);
    return c.json({ error: { message: msg } }, 500);
  }
}

/**
 * Returns a streaming response in OpenAI format.
 *
 * @param c - Hono context.
 * @param body - The source stream from Antigravity.
 * @param model - Model name.
 * @returns SSE response.
 */
function streamResponse(c: Context, body: ReadableStream<Uint8Array>, model: string): Response {
  const openaiStream = transformGeminiToOpenAIStream(body);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const requestId = `chatcmpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 29)}`;

  let buffer = '';

  const sseStream = new ReadableStream({
    start: async (controller) => {
      const reader = openaiStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const chunk = JSON.parse(trimmed);
              const enriched = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                ...chunk,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(enriched)}\n\n`));
            } catch {
              // skip
            }
          }
        }

        if (buffer.trim()) {
          try {
            const chunk = JSON.parse(buffer.trim());
            const enriched = {
              id: requestId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              ...chunk,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(enriched)}\n\n`));
          } catch { /* skip */ }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        console.error('[Stream] Error:', error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Accumulates stream data and returns a full chat completion object.
 *
 * @param c - Hono context.
 * @param body - The source stream from Antigravity.
 * @param model - Model name.
 * @returns Non-streaming JSON response.
 */
async function nonStreamResponse(
  c: Context,
  body: ReadableStream<Uint8Array>,
  model: string,
): Promise<Response> {
  const openaiStream = transformGeminiToOpenAIStream(body);
  const reader = openaiStream.getReader();
  const decoder = new TextDecoder();

  let fullContent = '';
  const toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
  let finishReason = 'stop';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const chunk = JSON.parse(trimmed);
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.delta?.content) {
          fullContent += choice.delta.content;
        }

        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            if (tc.id && tc.function?.name) {
              toolCalls.push({
                id: tc.id,
                type: tc.type || 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments || '{}',
                },
              });
            }
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      } catch {
        // Ignore invalid JSON in internal stream
      }
    }
  }

  if (buffer.trim()) {
    try {
      const chunk = JSON.parse(buffer.trim());
      const choice = chunk.choices?.[0];
      if (choice) {
        if (choice.delta?.content) fullContent += choice.delta.content;
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    } catch { /* skip */ }
  }

  if (toolCalls.length > 0) {
    finishReason = 'tool_calls';
  }

  const message: Record<string, unknown> = {
    role: 'assistant',
    content: fullContent || null,
  };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  return c.json({
    id: `chatcmpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 29)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason,
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  });
}
