import { assertEquals } from 'asserts';
import { app } from '../../src/main.ts';

Deno.test('@DisplayName("Verificação de integridade do serviço")', async () => {
  // Given
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;
  const url = `http://localhost:${port}/`;

  try {
    // When
    const response = await fetch(url);
    const body = await response.json();

    // Then
    assertEquals(response.status, 200);
    assertEquals(body, { status: 'ok', service: 'antigravity-openai-proxy' });
  } finally {
    await server.shutdown();
  }
});
