import { assertEquals } from 'asserts';
import { isClaudeModel, isThinkingCapableModel } from '../../src/antigravity/types.ts';

Deno.test('@DisplayName("Detecção de modelos Claude")', () => {
  // Given
  const claudeModels = ['claude-3-5-sonnet', 'claude-opus-4', 'CLAUDE-SONNET'];
  const otherModels = ['gemini-3-flash', 'gpt-4o'];

  // When & Then
  for (const model of claudeModels) {
    assertEquals(isClaudeModel(model), true, `Should detect ${model} as Claude`);
  }

  for (const model of otherModels) {
    assertEquals(isClaudeModel(model), false, `Should not detect ${model} as Claude`);
  }
});

Deno.test('@DisplayName("Detecção de modelos capazes de pensamento (thinking)")', () => {
  // Given
  const thinkingModels = ['gemini-3-flash', 'claude-opus-4', 'gemini-3-thinking'];
  const normalModels = ['gemini-1.5-flash', 'gpt-4o'];

  // When & Then
  for (const model of thinkingModels) {
    assertEquals(isThinkingCapableModel(model), true, `Should detect ${model} as thinking capable`);
  }

  for (const model of normalModels) {
    assertEquals(isThinkingCapableModel(model), false, `Should not detect ${model} as thinking capable`);
  }
});
