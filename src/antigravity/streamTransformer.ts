import { ENV } from '../util/env.ts';

interface StreamContext {
  toolCallIndex: number;
  emittedFunctionCalls: Set<number>;
}

/**
 * Transforms a Gemini SSE stream into an OpenAI-compatible SSE stream.
 *
 * @param body - The Gemini response body stream.
 * @returns A new stream in OpenAI format.
 */
export function transformGeminiToOpenAIStream(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const reader = body.getReader();
      const ctx: StreamContext = {
        toolCallIndex: 0,
        emittedFunctionCalls: new Set(),
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            processLine(line.trim(), controller, encoder, ctx);
          }
        }

        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data:')) {
            processLine(trimmed, controller, encoder, ctx);
          } else if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
              const items = JSON.parse(trimmed);
              const arr = Array.isArray(items) ? items : [items];
              for (const data of arr) {
                processGeminiChunk(data, controller, encoder, ctx);
              }
            } catch {
            }
          }
        }

        emitOpenAIChunk(controller, encoder, { choices: [{ delta: {}, finish_reason: 'stop' }] });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        emitOpenAIChunk(controller, encoder, {
          choices: [{ delta: { content: `\n\nStream error: ${msg}` }, finish_reason: 'stop' }],
        });
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Processes a single line of SSE data.
 *
 * @param line - The raw line from the stream.
 * @param controller - Stream controller.
 * @param encoder - Text encoder.
 * @param ctx - Stream context for state tracking.
 */
function processLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: StreamContext,
): void {
  if (!line || !line.startsWith('data:')) return;

  const jsonText = line.substring(5).trim();
  if (!jsonText || jsonText === '[DONE]') return;

  try {
    const data = JSON.parse(jsonText);
    processGeminiChunk(data, controller, encoder, ctx);
  } catch {
  }
}

/**
 * Processes a Gemini data chunk and emits corresponding OpenAI chunks.
 *
 * @param data - The parsed Gemini chunk.
 * @param controller - Stream controller.
 * @param encoder - Text encoder.
 * @param ctx - Stream context for state tracking.
 */
function processGeminiChunk(
  data: any,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: StreamContext,
): void {
  const parts = data.response?.candidates?.[0]?.content?.parts
    || data.candidates?.[0]?.content?.parts;
  if (!parts) return;

  const keepThinking = ENV.keepThinking;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.text) {
      if (part.thought === true && !keepThinking) continue;

      emitOpenAIChunk(controller, encoder, {
        choices: [{ delta: { content: part.text }, finish_reason: null }],
      });
    }

    if (part.functionCall) {
      if (ctx.emittedFunctionCalls.has(i)) continue;

      const { __thinking_text, ...cleanArgs } = part.functionCall.args || {};
      const callId = `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

      emitOpenAIChunk(controller, encoder, {
        choices: [{
          delta: {
            tool_calls: [{
              index: ctx.toolCallIndex,
              id: callId,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(cleanArgs),
              },
            }],
          },
          finish_reason: null,
        }],
      });

      ctx.emittedFunctionCalls.add(i);
      ctx.toolCallIndex++;
    }
  }
}

/**
 * Enqueues an OpenAI-formatted chunk into the stream.
 *
 * @param controller - Stream controller.
 * @param encoder - Text encoder.
 * @param data - The data object to emit.
 */
function emitOpenAIChunk(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  data: Record<string, unknown>,
): void {
  controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
}
