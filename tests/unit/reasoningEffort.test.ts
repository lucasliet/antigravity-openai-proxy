import { assertEquals } from 'asserts';
import {
  mapReasoningEffortToGemini3Flash,
  mapReasoningEffortToGemini3Pro,
  mapReasoningEffortToTokenBudget,
  normalizeModelForAntigravity,
} from '../../src/routes/chatCompletions.ts';

Deno.test('Deve normalizar modelos Gemini 3 Pro sem sufixo', () => {
  // Given & When & Then
  assertEquals(normalizeModelForAntigravity('gemini-3-pro'), 'gemini-3-pro-low');
  assertEquals(normalizeModelForAntigravity('GEMINI-3-PRO'), 'GEMINI-3-PRO-low');
  assertEquals(normalizeModelForAntigravity('Gemini-3-Pro'), 'Gemini-3-Pro-low');
});

Deno.test('Deve normalizar modelos Gemini 3 Pro com reasoning_effort', () => {
  // Given & When & Then
  assertEquals(normalizeModelForAntigravity('gemini-3-pro', 'high'), 'gemini-3-pro-high');
  assertEquals(normalizeModelForAntigravity('gemini-3-pro', 'medium'), 'gemini-3-pro-low');
  assertEquals(normalizeModelForAntigravity('gemini-3-pro', 'low'), 'gemini-3-pro-low');
});

Deno.test('Deve preservar sufixo existente em modelos Gemini 3 Pro', () => {
  // Given & When & Then
  assertEquals(normalizeModelForAntigravity('gemini-3-pro-low'), 'gemini-3-pro-low');
  assertEquals(normalizeModelForAntigravity('gemini-3-pro-high'), 'gemini-3-pro-high');
  assertEquals(normalizeModelForAntigravity('gemini-3-pro-medium'), 'gemini-3-pro-medium');
  assertEquals(normalizeModelForAntigravity('gemini-3-pro', 'high'), 'gemini-3-pro-high'); // suffix takes precedence or is preserved? Code says "match suffix", if matches, return model. So input model is returned.
  // Actually, let's verify logic:
  // if (lower.startsWith('gemini-3-pro') && !lower.match(/-(low|high|medium)$/))
  // So if it matches suffix, it skips the block and returns model.
  assertEquals(normalizeModelForAntigravity('gemini-3-pro-low', 'high'), 'gemini-3-pro-low');
});

Deno.test('Deve não adicionar sufixo em modelos Gemini 3 Flash', () => {
    // Given & When & Then
    assertEquals(normalizeModelForAntigravity('gemini-3-flash'), 'gemini-3-flash');
    assertEquals(normalizeModelForAntigravity('GEMINI-3-FLASH'), 'GEMINI-3-FLASH');
    assertEquals(normalizeModelForAntigravity('gemini-3-flash', 'low'), 'gemini-3-flash');
});

Deno.test('Deve preservar sufixo existente em modelos Gemini 3 Flash (se o usuário enviar manualmente)', () => {
  // Given & When & Then
  assertEquals(normalizeModelForAntigravity('gemini-3-flash-low'), 'gemini-3-flash-low');
  assertEquals(normalizeModelForAntigravity('gemini-3-flash-medium'), 'gemini-3-flash-medium');
});


Deno.test('Deve manter outros modelos sem modificação', () => {
  // Given & When & Then
  assertEquals(normalizeModelForAntigravity('gemini-2.5-flash'), 'gemini-2.5-flash');
  assertEquals(normalizeModelForAntigravity('gemini-1.5-flash'), 'gemini-1.5-flash');
  assertEquals(normalizeModelForAntigravity('gpt-4'), 'gpt-4');
});

Deno.test('Deve mapear reasoning_effort para Gemini 3 Pro corretamente', () => {
  // Given
  const testCases = [
    { input: 'low' as const, expected: 'low' },
    { input: 'medium' as const, expected: 'low' },
    { input: 'high' as const, expected: 'high' },
    { input: undefined, expected: 'low' },
  ];

  // When & Then
  for (const { input, expected } of testCases) {
    const result = mapReasoningEffortToGemini3Pro(input);
    assertEquals(result, expected, `Should map ${input} to ${expected}`);
  }
});

Deno.test('Deve mapear reasoning_effort para Gemini 3 Flash corretamente', () => {
  // Given
  const testCases = [
    { input: 'minimal' as const, expected: 'minimal' },
    { input: 'low' as const, expected: 'low' },
    { input: 'medium' as const, expected: 'medium' },
    { input: 'high' as const, expected: 'high' },
    { input: undefined, expected: 'medium' },
  ];

  // When & Then
  for (const { input, expected } of testCases) {
    const result = mapReasoningEffortToGemini3Flash(input);
    assertEquals(result, expected, `Should map ${input} to ${expected}`);
  }
});

Deno.test('Deve mapear reasoning_effort para token budget corretamente', () => {
  // Given
  const testCases = [
    { input: 'low' as const, expected: 8192 },
    { input: 'medium' as const, expected: 16384 },
    { input: 'high' as const, expected: 32768 },
    { input: undefined, expected: 16000 },
  ];

  // When & Then
  for (const { input, expected } of testCases) {
    const result = mapReasoningEffortToTokenBudget(input);
    assertEquals(result, expected, `Should map ${input} to ${expected}`);
  }
});
