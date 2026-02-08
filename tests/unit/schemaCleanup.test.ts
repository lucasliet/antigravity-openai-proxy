import { assertEquals, assertExists } from 'asserts';
import { cleanJsonSchema, cleanJSONSchemaForAntigravity } from '../../src/antigravity/schemaCleanup.ts';

Deno.test('@DisplayName("Limpeza de esquema JSON básica para Gemini")', () => {
  // Given
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 5 },
      age: { type: 'integer', format: 'int32' },
    },
    required: ['name'],
    additionalProperties: false,
  };

  // When
  const cleaned = cleanJsonSchema(schema);

  // Then
  assertEquals(cleaned.type, 'object');
  assertExists(cleaned.properties);
  const props = cleaned.properties as Record<string, any>;
  assertEquals(props.name.type, 'string');
  assertEquals(props.name.minLength, undefined);
  assertEquals(props.age.type, 'integer');
  assertEquals(props.age.format, undefined);
  assertEquals(cleaned.additionalProperties, undefined);
});

Deno.test('@DisplayName("Limpeza de esquema JSON avançada para Claude (Antigravity)")', () => {
  // Given
  const schema = {
    type: 'object',
    properties: {
      status: { type: 'string', const: 'active' },
      tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
      metadata: { type: 'object', additionalProperties: false },
    },
    required: ['status'],
  };

  // When
  const cleaned = cleanJSONSchemaForAntigravity(schema);

  // Then
  // const should be converted to enum
  assertEquals(cleaned.properties.status.enum, ['active']);
  
  // minItems should be moved to description
  assertExists(cleaned.properties.tags.description);
  assertEquals(cleaned.properties.tags.description.includes('minItems: 1'), true);
  
  // additionalProperties: false should be moved to description
  assertExists(cleaned.properties.metadata.description);
  assertEquals(cleaned.properties.metadata.description.includes('No extra properties allowed'), true);
  
  // Empty object should have placeholder
  assertExists(cleaned.properties.metadata.properties._placeholder);
});

Deno.test('@DisplayName("Mesclagem de allOf para Claude")', () => {
  // Given
  const schema = {
    allOf: [
      { properties: { a: { type: 'string' } }, required: ['a'] },
      { properties: { b: { type: 'number' } } },
    ],
  };

  // When
  const cleaned = cleanJSONSchemaForAntigravity(schema);

  // Then
  assertExists(cleaned.properties.a);
  assertExists(cleaned.properties.b);
  assertEquals(cleaned.required, ['a']);
  assertEquals(cleaned.allOf, undefined);
});

Deno.test('@DisplayName("Achatamento de anyOf/oneOf para Claude")', () => {
  // Given
  const schema = {
    anyOf: [
      { type: 'string' },
      { type: 'object', properties: { x: { type: 'number' } } },
    ],
  };

  // When
  const cleaned = cleanJSONSchemaForAntigravity(schema);

  // Then
  // Should select the most complex one (object)
  assertEquals(cleaned.type, 'object');
  assertExists(cleaned.properties.x);
  assertExists(cleaned.description);
  assertEquals(cleaned.description.includes('Accepts: string | object'), true);
});
