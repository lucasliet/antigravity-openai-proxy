import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mapReasoningEffortToGemini3Pro,
  mapReasoningEffortToGemini3Flash,
  mapReasoningEffortToTokenBudget,
  normalizeModelForAntigravity,
} from "../../src/routes/chatCompletions.ts";
import { resolveModelForHeaderStyle } from "../../src/antigravity/types.ts";

Deno.test("mapReasoningEffortToGemini3Pro - mapeia corretamente os níveis", () => {
  assertEquals(mapReasoningEffortToGemini3Pro("low"), "low");
  assertEquals(mapReasoningEffortToGemini3Pro("medium"), "low");
  assertEquals(mapReasoningEffortToGemini3Pro("high"), "high");
  assertEquals(mapReasoningEffortToGemini3Pro("minimal"), "low");
  assertEquals(mapReasoningEffortToGemini3Pro(undefined), "low");
});

Deno.test("mapReasoningEffortToGemini3Flash - mapeia corretamente os níveis", () => {
  assertEquals(mapReasoningEffortToGemini3Flash("low"), "low");
  assertEquals(mapReasoningEffortToGemini3Flash("medium"), "medium");
  assertEquals(mapReasoningEffortToGemini3Flash("high"), "high");
  assertEquals(mapReasoningEffortToGemini3Flash("minimal"), "minimal");
  assertEquals(mapReasoningEffortToGemini3Flash(undefined), "medium");
});

Deno.test("mapReasoningEffortToTokenBudget - mapeia corretamente os budgets", () => {
  assertEquals(mapReasoningEffortToTokenBudget("low"), 8192);
  assertEquals(mapReasoningEffortToTokenBudget("medium"), 16384);
  assertEquals(mapReasoningEffortToTokenBudget("high"), 32768);
  assertEquals(mapReasoningEffortToTokenBudget("minimal"), 8192);
  assertEquals(mapReasoningEffortToTokenBudget(undefined), 16000);
});

Deno.test("normalizeModelForAntigravity - adiciona sufixo apenas para Gemini 3 Pro sem tier", () => {
  assertEquals(
    normalizeModelForAntigravity("gemini-3-pro"),
    "gemini-3-pro-low"
  );
  
  assertEquals(
    normalizeModelForAntigravity("gemini-3-pro", "high"),
    "gemini-3-pro-high"
  );
  
  assertEquals(
    normalizeModelForAntigravity("gemini-3-pro-low"),
    "gemini-3-pro-low"
  );
  
  assertEquals(
    normalizeModelForAntigravity("gemini-3-flash"),
    "gemini-3-flash"
  );
  
  assertEquals(
    normalizeModelForAntigravity("gemini-3-flash", "high"),
    "gemini-3-flash"
  );
  
  assertEquals(
    normalizeModelForAntigravity("claude-sonnet-4-5"),
    "claude-sonnet-4-5"
  );
});

Deno.test("resolveModelForHeaderStyle - antigravity style remove -preview", () => {
  assertEquals(
    resolveModelForHeaderStyle("gemini-3-flash-preview", "antigravity"),
    "gemini-3-flash"
  );
  
  assertEquals(
    resolveModelForHeaderStyle("gemini-3-pro-preview", "antigravity"),
    "gemini-3-pro"
  );
  
  assertEquals(
    resolveModelForHeaderStyle("gemini-3-flash", "antigravity"),
    "gemini-3-flash"
  );
  
  assertEquals(
    resolveModelForHeaderStyle("claude-sonnet-4-5", "antigravity"),
    "claude-sonnet-4-5"
  );
});

Deno.test("resolveModelForHeaderStyle - gemini-cli style adiciona -preview e remove tier", () => {
  assertEquals(
    resolveModelForHeaderStyle("gemini-3-flash", "gemini-cli"),
    "gemini-3-flash-preview"
  );
  
  assertEquals(
    resolveModelForHeaderStyle("gemini-3-pro", "gemini-cli"),
    "gemini-3-pro-preview"
  );
  
  assertEquals(
    resolveModelForHeaderStyle("gemini-3-pro-low", "gemini-cli"),
    "gemini-3-pro-preview"
  );
  
  assertEquals(
    resolveModelForHeaderStyle("gemini-3-flash-high", "gemini-cli"),
    "gemini-3-flash-preview"
  );
  
  assertEquals(
    resolveModelForHeaderStyle("gemini-3-flash-preview", "gemini-cli"),
    "gemini-3-flash-preview"
  );
  
  assertEquals(
    resolveModelForHeaderStyle("claude-sonnet-4-5", "gemini-cli"),
    "claude-sonnet-4-5"
  );
});

Deno.test("Fluxo completo: normalização + resolução para antigravity", () => {
  const model = "gemini-3-pro";
  const normalized = normalizeModelForAntigravity(model, "medium");
  assertEquals(normalized, "gemini-3-pro-low");
  
  const resolved = resolveModelForHeaderStyle(normalized, "antigravity");
  assertEquals(resolved, "gemini-3-pro-low");
});

Deno.test("Fluxo completo: normalização + resolução para gemini-cli", () => {
  const model = "gemini-3-pro-low";
  const resolved = resolveModelForHeaderStyle(model, "gemini-cli");
  assertEquals(resolved, "gemini-3-pro-preview");
});
