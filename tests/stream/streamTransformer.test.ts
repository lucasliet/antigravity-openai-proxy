import { assertEquals } from 'asserts';
import { transformGeminiToOpenAIStream } from '../../src/antigravity/streamTransformer.ts';

/**
 * Cria um ReadableStream de Uint8Array a partir de uma lista de strings.
 */
function createStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
}

/**
 * Lê todos os chunks de um stream e os converte em objetos JSON.
 */
async function readStreamResults(stream: ReadableStream<Uint8Array>): Promise<any[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const results: any[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        try {
          results.push(JSON.parse(line));
        } catch {
          // Ignora linhas que não são JSON (ex: erros de parse propositais)
        }
      }
    }
  }
  return results;
}

Deno.test('@DisplayName("Transformação básica de chunks de texto")', async () => {
  // Given
  const geminiChunks = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Olá"}]}}]}',
    'data: {"candidates":[{"content":{"parts":[{"text":" mundo"}]}}]}',
  ];
  const input = createStream(geminiChunks);

  // When
  const output = transformGeminiToOpenAIStream(input);
  const results = await readStreamResults(output);

  // Then
  assertEquals(results.length, 3); // 2 texto + 1 stop
  assertEquals(results[0].choices[0].delta.content, 'Olá');
  assertEquals(results[1].choices[0].delta.content, ' mundo');
  assertEquals(results[2].choices[0].finish_reason, 'stop');
});

Deno.test('@DisplayName("Deduplicação de chamadas de função cumulativas")', async () => {
  // Given
  const geminiChunks = [
    // Chunk 1: Primeira parte da função
    'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_weather","args":{"city":"São Paulo"}}}]}}]}',
    // Chunk 2: Gemini manda de novo o mesmo part (cumulativo)
    'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_weather","args":{"city":"São Paulo"}}}]}}]}',
  ];
  const input = createStream(geminiChunks);

  // When
  const output = transformGeminiToOpenAIStream(input);
  const results = await readStreamResults(output);

  // Then
  // Deve emitir apenas 1 tool_call e 1 stop
  assertEquals(results.length, 2);
  assertEquals(results[0].choices[0].delta.tool_calls[0].function.name, 'get_weather');
  assertEquals(results[1].choices[0].finish_reason, 'stop');
});

Deno.test('@DisplayName("Filtro de blocos de pensamento (thought) por padrão")', async () => {
  // Given
  Deno.env.set('KEEP_THINKING', 'false');
  const geminiChunks = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Pensando...","thought":true}]}}]}',
    'data: {"candidates":[{"content":{"parts":[{"text":"Pensando...","thought":true},{"text":"Olá!"}]}}]}',
  ];
  const input = createStream(geminiChunks);

  // When
  const output = transformGeminiToOpenAIStream(input);
  const results = await readStreamResults(output);

  // Then
  // O thought deve ser ignorado. Note que o segundo chunk tem o thought E o Olá.
  // Como o streamTransformer processa todos os parts de cada chunk:
  // Chunk 1: thought (ignorado)
  // Chunk 2: thought (ignorado), Olá (emitido)
  assertEquals(results.length, 2); // 1 texto + 1 stop
  assertEquals(results[0].choices[0].delta.content, 'Olá!');
});

Deno.test('@DisplayName("Preservação de blocos de pensamento quando habilitado")', async () => {
  // Given
  Deno.env.set('KEEP_THINKING', 'true');
  const geminiChunks = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Pensando...","thought":true}]}}]}',
  ];
  const input = createStream(geminiChunks);

  // When
  const output = transformGeminiToOpenAIStream(input);
  const results = await readStreamResults(output);

  // Then
  assertEquals(results.length, 2);
  assertEquals(results[0].choices[0].delta.content, 'Pensando...');
  
  // Cleanup
  Deno.env.set('KEEP_THINKING', 'false');
});

Deno.test('@DisplayName("Remoção de __thinking_text dos argumentos de função")', async () => {
  // Given
  const geminiChunks = [
    'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"search","args":{"query":"Deno","__thinking_text":"Searching..."}}}]}}]}',
  ];
  const input = createStream(geminiChunks);

  // When
  const output = transformGeminiToOpenAIStream(input);
  const results = await readStreamResults(output);

  // Then
  const toolCall = results[0].choices[0].delta.tool_calls[0];
  const args = JSON.parse(toolCall.function.arguments);
  assertEquals(args.query, 'Deno');
  assertEquals(args.__thinking_text, undefined);
});

Deno.test('@DisplayName("Tratamento de entrada JSON raw (não-SSE)")', async () => {
  // Given
  const rawJson = '{"candidates":[{"content":{"parts":[{"text":"Resposta direta"}]}}]}';
  // Envia sem newline para cair no bloco de processamento de buffer restante
  const input = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(rawJson));
      controller.close();
    },
  });

  // When
  const output = transformGeminiToOpenAIStream(input);
  const results = await readStreamResults(output);

  // Then
  assertEquals(results[0].choices[0].delta.content, 'Resposta direta');
  assertEquals(results[1].choices[0].finish_reason, 'stop');
});

Deno.test('@DisplayName("Propagação de erros no stream")', async () => {
  // Given
  const errorStream = new ReadableStream({
    start(controller) {
      controller.error(new Error('Falha na conexão'));
    },
  });

  // When
  const output = transformGeminiToOpenAIStream(errorStream);
  const results = await readStreamResults(output);

  // Then
  assertEquals(results.length, 1);
  assertEquals(results[0].choices[0].delta.content, '\n\nStream error: Falha na conexão');
  assertEquals(results[0].choices[0].finish_reason, 'stop');
});
