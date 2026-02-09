import { Context, Hono } from 'hono';
import { chatCompletions } from './routes/chatCompletions.ts';
import { listModels } from './routes/models.ts';
import { ENV } from './util/env.ts';
import { AntigravityAuth } from './cli/antigravityAuth.ts';
import { getCacheMetrics } from './antigravity/oauth.ts';

export const app = new Hono();

app.get('/', (c: Context) => c.json({ status: 'ok', service: 'antigravity-openai-proxy' }));

app.get('/metrics', (c: Context) => {
  const metrics = getCacheMetrics();
  return c.json({
    oauth: {
      cache: metrics,
      uptime: Deno.env.get('UPTIME') || 'unknown',
    },
  });
});

app.post('/v1/chat/completions', chatCompletions);
app.get('/v1/models', listModels);

app.post('/chat/completions', chatCompletions);
app.get('/models', listModels);

if (import.meta.main) {
  if (Deno.args.includes('antigravity-login')) {
    const auth = new AntigravityAuth();
    await auth.run();
  } else {
    const port = ENV.port;
    console.log(`[Proxy] Antigravity OpenAI Proxy listening on port ${port}`);
    Deno.serve({ port }, app.fetch);
  }
}
