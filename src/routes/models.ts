import type { Context } from 'hono';
import { SUPPORTED_MODELS } from '../antigravity/types.ts';

/**
 * Lists available models in OpenAI format.
 *
 * @param c - Hono context.
 * @returns Response object with the list of supported models.
 */
export function listModels(c: Context): Response {
  return c.json({
    object: 'list',
    data: SUPPORTED_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      object: 'model',
      created: 1700000000,
      owned_by: m.owned_by,
    })),
  });
}
