import type { Context } from 'hono';
import type { AntigravityRequestPayload, OpenAIChatRequest } from '../antigravity/types.ts';
import {
  DEFAULT_THINKING_BUDGET,
  isClaudeModel,
  isThinkingCapableModel,
  REASONING_EFFORT_BUDGETS,
} from '../antigravity/types.ts';
import { toGeminiFormat, toGeminiTools } from '../antigravity/transformer.ts';
import { makeAntigravityRequest } from '../antigravity/client.ts';
import { getAccessToken, getProjectId } from '../antigravity/oauth.ts';
import { transformGeminiToOpenAIStream } from '../antigravity/streamTransformer.ts';

export function mapReasoningEffortToGemini3Pro(
  reasoning_effort?: 'low' | 'medium' | 'high' | 'minimal',
): string {
  switch (reasoning_effort) {
    case 'low': return 'low';
    case 'medium': return 'low';
    case 'high': return 'high';
    case 'minimal': return 'low';
    default: return 'low';
  }
}

export function mapReasoningEffortToGemini3Flash(
  reasoning_effort?: 'low' | 'medium' | 'high' | 'minimal',
): string {
  switch (reasoning_effort) {
    case 'minimal': return 'minimal';
    case 'low': return 'low';
    case 'medium': return 'medium';
    case 'high': return 'high';
    default: return 'medium';
  }
}

export function mapReasoningEffortToTokenBudget(
  reasoning_effort?: 'low' | 'medium' | 'high' | 'minimal',
): number {
  switch (reasoning_effort) {
    case 'low': return REASONING_EFFORT_BUDGETS.low;
    case 'medium': return REASONING_EFFORT_BUDGETS.medium;
    case 'high': return REASONING_EFFORT_BUDGETS.high;
    case 'minimal': return REASONING_EFFORT_BUDGETS.low;
    default: return DEFAULT_THINKING_BUDGET;
  }
}

export function normalizeModelForAntigravity(
  model: string,
  reasoningEffort?: 'low' | 'medium' | 'high' | 'minimal'
): string {
  const lower = model.toLowerCase();

  if (lower.startsWith('gemini-3-pro') && !lower.match(/-(low|high|medium|minimal)$/)) {
    return `${model}-${mapReasoningEffortToGemini3Pro(reasoningEffort)}`;
  }

  return model;
}

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
    const hasTools = body.tools && body.tools.length > 0;
    const { systemInstruction, contents } = toGeminiFormat(body.messages, model, hasTools);

    const tools = (body.tools && body.tools.length > 0)
      ? toGeminiTools(body.tools, model)
      : undefined;

    const generationConfig: Record<string, unknown> = {};
    if (body.max_tokens) generationConfig.maxOutputTokens = body.max_tokens;
    if (body.temperature !== undefined) generationConfig.temperature = body.temperature;
    if (body.top_p !== undefined) generationConfig.topP = body.top_p;
    if (body.stop) generationConfig.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];

    if (thinking) {
      const lowerModel = model.toLowerCase();
      const isGemini3 = lowerModel.includes('gemini-3');

      if (isGemini3) {
        const isGemini3Pro = lowerModel.includes('gemini-3-pro');
        const isGemini3Flash = lowerModel.includes('gemini-3-flash');

        let thinkingLevel: string;
        if (isGemini3Pro) {
          thinkingLevel = mapReasoningEffortToGemini3Pro(body.reasoning_effort);
        } else if (isGemini3Flash) {
          thinkingLevel = mapReasoningEffortToGemini3Flash(body.reasoning_effort);
        } else {
          throw new Error(`Unsupported Gemini 3 model: ${model}`);
        }

        generationConfig.thinkingConfig = {
          thinkingLevel,
          includeThoughts: true,
        };
      } else if (claude) {
        const thinkingBudget = mapReasoningEffortToTokenBudget(body.reasoning_effort);
        generationConfig.thinkingConfig = {
          include_thoughts: true,
          thinking_budget: thinkingBudget,
        };
        const CLAUDE_THINKING_MAX_OUTPUT_TOKENS = 64_000;
        if (!generationConfig.maxOutputTokens || (generationConfig.maxOutputTokens as number) <= thinkingBudget) {
          generationConfig.maxOutputTokens = CLAUDE_THINKING_MAX_OUTPUT_TOKENS;
        }
      } else {
        const thinkingBudget = mapReasoningEffortToTokenBudget(body.reasoning_effort);
        generationConfig.thinkingConfig = {
          thinkingBudget,
          includeThoughts: true,
        };
      }
    }

    const projectId = await getProjectId(refreshToken);
    const accessToken = await getAccessToken(refreshToken);

    const antigravityModel = normalizeModelForAntigravity(model, body.reasoning_effort);
    const requestType = 'agent';

    console.log(`[ChatCompletions] Model mapping: ${model} -> ${antigravityModel} (reasoning_effort: ${body.reasoning_effort || 'undefined'}, requestType: ${requestType})`);

    const toolConfig = claude && tools
      ? { functionCallingConfig: { mode: "VALIDATED" } }
      : undefined;

    const sessionId = `session-${crypto.randomUUID()}`;

    const payload: AntigravityRequestPayload = {
      project: projectId,
      model: antigravityModel,
      userAgent: 'antigravity',
      requestId: `agent-${crypto.randomUUID()}`,
      requestType,
      request: {
        contents,
        ...(tools ? { tools } : {}),
        ...(toolConfig ? { toolConfig } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
        ...(systemInstruction ? {
          systemInstruction: { role: 'user' as const, parts: [{ text: systemInstruction }] },
        } : {}),
        sessionId,
      },
    };

    const response = await makeAntigravityRequest(
      payload as unknown as Record<string, unknown>,
      accessToken,
      { 
        refreshToken,
        headerStyle: claude ? "antigravity" : "gemini-cli"
      }
    );

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
