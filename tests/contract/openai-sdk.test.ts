// Set env vars BEFORE any imports that might use them
Deno.env.set("ANTIGRAVITY_REFRESH_TOKEN", "mock-refresh-token");
Deno.env.set("ANTIGRAVITY_PROJECT_ID", "mock-project-id");

import OpenAI from "npm:openai";
import { assertEquals, assertExists } from "asserts";
import { stub } from "mock";

// Dynamic import to ensure env vars are set before src/main.ts (and its dependencies) are loaded
const { app } = await import("../../src/main.ts");
const { resetCleanupTimer } = await import("../../src/antigravity/oauth.ts");

Deno.test('@DisplayName("Contrato: Listagem de Modelos via SDK OpenAI")', async () => {
  // Given
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;
  const client = new OpenAI({
    apiKey: "any",
    baseURL: `http://localhost:${port}/v1`,
  });

  try {
    // When
    const models = await client.models.list();

    // Then
    assertExists(models.data);
    assertEquals(models.data.length > 0, true);
    assertEquals(models.data[0].object, "model");
  } finally {
    await server.shutdown();
  }
});

Deno.test('@DisplayName("Contrato: Chat Completions (Sem Streaming) via SDK OpenAI")', async () => {
  // Given
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;
  const client = new OpenAI({
    apiKey: "any",
    baseURL: `http://localhost:${port}/v1`,
  });

  // Mock global fetch
  const fetchStub = stub(globalThis, "fetch", (input: string | URL | Request) => {
    const url = input.toString();
    
    if (url.includes("oauth2.googleapis.com/token")) {
      return Promise.resolve(new Response(JSON.stringify({
        access_token: "mock-access-token",
        expires_in: 3600,
      }), { status: 200 }));
    }

    if (url.includes("streamGenerateContent")) {
      const geminiResponse = {
        candidates: [{
          content: {
            parts: [{ text: "Hello from mock!" }]
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

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  });

  try {
    // When
    const response = await client.chat.completions.create({
      model: "gemini-3-flash",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
    });

    // Then
    assertEquals(response.choices[0].message.content, "Hello from mock!");
    assertEquals(response.model, "gemini-3-flash");
  } finally {
    fetchStub.restore();
    await server.shutdown();
    resetCleanupTimer();
  }
});

Deno.test('@DisplayName("Contrato: Chat Completions (Streaming) via SDK OpenAI")', async () => {
  // Given
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;
  const client = new OpenAI({
    apiKey: "any",
    baseURL: `http://localhost:${port}/v1`,
  });

  // Mock global fetch
  const fetchStub = stub(globalThis, "fetch", (input: string | URL | Request) => {
    const url = input.toString();
    
    if (url.includes("oauth2.googleapis.com/token")) {
      return Promise.resolve(new Response(JSON.stringify({
        access_token: "mock-access-token",
        expires_in: 3600,
      }), { status: 200 }));
    }

    if (url.includes("streamGenerateContent")) {
      const chunk1 = {
        candidates: [{
          content: { parts: [{ text: "Hello " }] }
        }]
      };
      const chunk2 = {
        candidates: [{
          content: { parts: [{ text: "Hello " }, { text: "world!" }] },
          finishReason: "STOP"
        }]
      };
      
      const sseContent = `data: ${JSON.stringify({ response: chunk1 })}\n\ndata: ${JSON.stringify({ response: chunk2 })}\n\n`;
      return Promise.resolve(new Response(new TextEncoder().encode(sseContent), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      }));
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  });

  try {
    // When
    const stream = await client.chat.completions.create({
      model: "gemini-3-flash",
      messages: [{ role: "user", content: "Hi" }],
      stream: true,
    });

    let fullText = "";
    for await (const chunk of stream) {
      fullText += chunk.choices[0]?.delta?.content || "";
    }

    // Then
    assertEquals(fullText, "Hello Hello world!");
  } finally {
    fetchStub.restore();
    await server.shutdown();
    resetCleanupTimer();
  }
});

Deno.test('@DisplayName("Contrato: Chat Completions com Tool Calls via SDK OpenAI")', async () => {
  // Given
  const server = Deno.serve({ port: 0 }, app.fetch);
  const { port } = server.addr;
  const client = new OpenAI({
    apiKey: "any",
    baseURL: `http://localhost:${port}/v1`,
  });

  // Mock global fetch
  const fetchStub = stub(globalThis, "fetch", (input: string | URL | Request) => {
    const url = input.toString();
    
    if (url.includes("oauth2.googleapis.com/token")) {
      return Promise.resolve(new Response(JSON.stringify({
        access_token: "mock-access-token",
        expires_in: 3600,
      }), { status: 200 }));
    }

    if (url.includes("streamGenerateContent")) {
      const geminiResponse = {
        candidates: [{
          content: {
            parts: [{
              functionCall: {
                name: "get_weather",
                args: { location: "São Paulo" }
              }
            }]
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

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  });

  try {
    // When
    const response = await client.chat.completions.create({
      model: "gemini-3-flash",
      messages: [{ role: "user", content: "Qual o tempo em SP?" }],
      tools: [{
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the current weather in a given location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" }
            }
          }
        }
      }],
      stream: false,
    });

    // Then
    const toolCall = response.choices[0].message.tool_calls?.[0];
    assertExists(toolCall);
    assertEquals(toolCall.type, "function");
    if (toolCall.type === "function") {
      assertEquals(toolCall.function.name, "get_weather");
      assertEquals(JSON.parse(toolCall.function.arguments), { location: "São Paulo" });
    }
  } finally {
    fetchStub.restore();
    await server.shutdown();
    resetCleanupTimer();
  }
});
