import { assertEquals, assertExists } from 'asserts';
import { toGeminiTools } from '../../src/antigravity/transformer.ts';
import type { OpenAITool } from '../../src/antigravity/types.ts';

Deno.test('@DisplayName("Conversão de ferramentas para modelos Gemini")', () => {
  // Given
  const tools: OpenAITool[] = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', minLength: 1 },
          },
          required: ['location'],
        },
      },
    },
  ];
  const model = 'gemini-3-flash';

  // When
  const result = toGeminiTools(tools, model);

  // Then
  assertEquals(result.length, 1);
  const decl = result[0].functionDeclarations[0];
  assertEquals(decl.name, 'get_weather');
  assertEquals(decl.description, 'Get the current weather');
  // Gemini cleanup should remove minLength
  assertEquals((decl.parameters.properties as any).location.minLength, undefined);
});

Deno.test('@DisplayName("Conversão de ferramentas para modelos Claude")', () => {
  // Given
  const tools: OpenAITool[] = [
    {
      type: 'function',
      function: {
        name: 'calculate',
        description: 'Run a calculation',
        parameters: {
          type: 'object',
          properties: {
            expr: { type: 'string', pattern: '^[0-9+*-/() ]+$' },
          },
        },
      },
    },
  ];
  const model = 'claude-3-5-sonnet';

  // When
  const result = toGeminiTools(tools, model);

  // Then
  assertEquals(result.length, 1);
  const decl = result[0].functionDeclarations[0];
  assertEquals(decl.name, 'calculate');
  // Claude cleanup should move pattern to description
  const expr = (decl.parameters.properties as any).expr;
  assertEquals(expr.pattern, undefined);
  assertExists(expr.description);
  assertEquals(expr.description.includes('pattern: ^[0-9+*-/() ]+$'), true);
});
