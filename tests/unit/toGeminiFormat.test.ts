import { assertEquals } from 'asserts';
import { toGeminiFormat } from '../../src/antigravity/transformer.ts';
import type { OpenAIMessage } from '../../src/antigravity/types.ts';

Deno.test('@DisplayName("Conversão de mensagem de sistema")', () => {
  // Given
  const messages: OpenAIMessage[] = [
    { role: 'system', content: 'You are a helpful assistant' },
  ];

  // When
  const result = toGeminiFormat(messages);

  // Then
  assertEquals(result.systemInstruction, 'You are a helpful assistant');
  assertEquals(result.contents.length, 0);
});

Deno.test('@DisplayName("Conversão de mensagens de usuário e assistente")', () => {
  // Given
  const messages: OpenAIMessage[] = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ];

  // When
  const result = toGeminiFormat(messages);

  // Then
  assertEquals(result.contents.length, 2);
  assertEquals(result.contents[0].role, 'user');
  assertEquals(result.contents[0].parts[0].text, 'Hello');
  assertEquals(result.contents[1].role, 'model');
  assertEquals(result.contents[1].parts[0].text, 'Hi there!');
});

Deno.test('@DisplayName("Conversão de chamadas de ferramenta (tool calls)")', () => {
  // Given
  const messages: OpenAIMessage[] = [
    {
      role: 'assistant',
      content: 'Thinking...',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location": "London"}' },
        },
      ],
    },
  ];

  // When
  const result = toGeminiFormat(messages);

  // Then
  assertEquals(result.contents.length, 1);
  const parts = result.contents[0].parts;
  assertEquals(parts.length, 2);
  assertEquals(parts[0].text, 'Thinking...');
  assertEquals(parts[1].functionCall?.name, 'get_weather');
  assertEquals(parts[1].functionCall?.id, 'call_123');
  assertEquals(parts[1].functionCall?.args, { location: 'London' });
});

Deno.test('@DisplayName("Conversão de resposta de ferramenta")', () => {
  // Given
  const messages: OpenAIMessage[] = [
    {
      role: 'assistant',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location": "London"}' },
        },
      ],
      content: null,
    },
    {
      role: 'tool',
      tool_call_id: 'call_123',
      name: 'get_weather',
      content: '{"temp": 20}',
    },
  ];

  // When
  const result = toGeminiFormat(messages);

  // Then
  assertEquals(result.contents.length, 2);
  assertEquals(result.contents[1].role, 'user');
  assertEquals(result.contents[1].parts[0].functionResponse?.name, 'get_weather');
  assertEquals(result.contents[1].parts[0].functionResponse?.id, 'call_123');
  assertEquals(result.contents[1].parts[0].functionResponse?.response, { result: '{"temp": 20}' });
});

Deno.test('@DisplayName("Conversão de conteúdo multimodal (imagem base64)")', () => {
  // Given
  const messages: OpenAIMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' },
        },
      ],
    },
  ];

  // When
  const result = toGeminiFormat(messages);

  // Then
  assertEquals(result.contents.length, 1);
  assertEquals(result.contents[0].parts.length, 2);
  assertEquals(result.contents[0].parts[0].text, 'What is in this image?');
  assertEquals(result.contents[0].parts[1].inlineData?.mimeType, 'image/png');
  assertEquals(result.contents[0].parts[1].inlineData?.data, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
});
