import { assertEquals, assertExists } from 'asserts';
import { app } from '../../src/main.ts';

Deno.test('@DisplayName("Listagem de modelos suportados pela API")', async () => {
  // Given
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;
  const url = `http://localhost:${port}/v1/models`;

  try {
    // When
    const response = await fetch(url);
    const body = await response.json();

    // Then
    assertEquals(response.status, 200);
    assertEquals(body.object, 'list');
    assertExists(body.data);
    assertEquals(Array.isArray(body.data), true);

    if (body.data.length > 0) {
      const model = body.data[0];
      assertExists(model.id);
      assertExists(model.name);
      assertEquals(model.object, 'model');
      assertExists(model.owned_by);
    }
  } finally {
    await server.shutdown();
  }
});
