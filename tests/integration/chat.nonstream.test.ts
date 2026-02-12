import { assertEquals, assertExists } from 'asserts';
import { stub } from "mock";
import { app } from '../../src/main.ts';
import { resetCleanupTimer } from '../../src/antigravity/oauth.ts';

// Mock env vars
Deno.env.set("ANTIGRAVITY_REFRESH_TOKEN", "mock-refresh-token");
Deno.env.set("ANTIGRAVITY_PROJECT_ID", "mock-project-id");

Deno.test('@DisplayName("Criação de chat completion sem streaming")', async () => {
  // Given
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;
  const url = `http://localhost:${port}/v1/chat/completions`;
  
  const payload = {
    model: 'gemini-3-flash',
    messages: [
      { role: 'user', content: 'Say hello in one word' }
    ],
    stream: false
  };

  // Save original fetch
  const originalFetch = globalThis.fetch;

  // Mock global fetch
  const fetchStub = stub(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    const urlStr = input.toString();
    
    // Pass through local requests to the server we just started
    if (urlStr.includes("localhost")) {
      return originalFetch(input, init);
    }
    
    if (urlStr.includes("oauth2.googleapis.com/token")) {
      return Promise.resolve(new Response(JSON.stringify({
        access_token: "mock-access-token",
        expires_in: 3600,
      }), { status: 200 }));
    }

    if (urlStr.includes("streamGenerateContent")) {
      const geminiResponse = {
        candidates: [{
          content: {
            parts: [{ text: "Hello" }]
          },
          finishReason: "STOP"
        }]
      };
      
      const sseContent = `data: ${JSON.stringify({ response: geminiResponse })}\n\n`;
      return Promise.resolve(new Response(new TextEncoder().encode(sseContent), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      }));
    }

    if (urlStr.includes("v1internal:loadCodeAssist")) {
      return Promise.resolve(new Response(JSON.stringify({
        cloudaicompanionProject: "mock-project-id"
      }), { status: 200 }));
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  });

  try {
    // When
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-refresh-token',
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    // Then
    assertEquals(response.status, 200);
    assertEquals(body.object, 'chat.completion');
    assertExists(body.id);
    assertExists(body.choices);
    assertEquals(body.choices.length, 1);
    assertEquals(body.choices[0].message.content, 'Hello');
    assertEquals(body.choices[0].message.role, 'assistant');
  } finally {
    fetchStub.restore();
    await server.shutdown();
    resetCleanupTimer();
  }
});
