Ok Lucas, aqui vai o detalhamento completo com código linha a linha. Vou cobrir cada arquivo do projeto.

---

## Modelos Disponíveis no Antigravity

Baseado na análise do codebase, o Antigravity suporta esses modelos (detectados pelas funções `isClaudeModel` e `isThinkingCapableModel`):

| Modelo | String | isClaudeModel | isThinkingModel | Schema Cleanup | Thinking Config |
|--------|--------|---------------|-----------------|----------------|-----------------|
| Gemini 3 Flash | `gemini-3-flash` | false | true | `cleanJsonSchema` (simples) | `generationConfig.thinkingConfig` |
| Gemini 3 Pro | `gemini-3-pro` | false | true | `cleanJsonSchema` (simples) | `generationConfig.thinkingConfig` |
| Claude Sonnet 4.5 | `claude-sonnet-4-5` | true | false | `cleanJSONSchemaForAntigravity` (completo) | Sem thinking |
| Claude Opus 4 | `claude-opus-4` | true | true | `cleanJSONSchemaForAntigravity` (completo) | `request.thinking` (estilo Anthropic) |

O Opus é especial — é o único modelo que é simultaneamente `isClaudeModel=true` E `isThinkingModel=true`. Isso significa que ele usa a limpeza agressiva de schema do Claude E o formato de thinking da Anthropic (`request.thinking.type: 'enabled'`), não o formato Gemini (`generationConfig.thinkingConfig`).

---

## Arquitetura e Código Completo

### `deno.json`

```json
{
  "tasks": {
    "dev": "deno run --allow-net --allow-env --allow-read --watch src/main.ts",
    "start": "deno run --allow-net --allow-env --allow-read src/main.ts",
    "test": "deno test --allow-net --allow-env --allow-read tests/"
  },
  "imports": {
    "hono": "https://deno.land/x/hono@v4.4.0/mod.ts",
    "hono/streaming": "https://deno.land/x/hono@v4.4.0/helper/streaming/index.ts",
    "asserts": "https://deno.land/std@0.224.0/assert/mod.ts"
  },
  "compilerOptions": {
    "strict": true
  }
}
```

---

### `src/main.ts`

Entry point. Monta as rotas e sobe o servidor.

```typescript
import { Hono } from 'hono';
import { chatCompletions } from './routes/chatCompletions.ts';
import { listModels } from './routes/models.ts';

const app = new Hono();

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'antigravity-openai-proxy' }));

// OpenAI-compatible routes
app.post('/v1/chat/completions', chatCompletions);
app.get('/v1/models', listModels);

// Compat: sem /v1 prefix também funciona
app.post('/chat/completions', chatCompletions);
app.get('/models', listModels);

const port = parseInt(Deno.env.get('PORT') || '8000');
console.log(`[Proxy] Antigravity OpenAI Proxy listening on port ${port}`);
Deno.serve({ port }, app.fetch);
```

Simples. Hono é leve, sem overhead. O caller bate em `/v1/chat/completions` exatamente como bateria na OpenAI.

---

### `src/util/env.ts`

Centraliza env vars para não ficar `Deno.env.get` espalhado.

```typescript
export const ENV = {
  get refreshToken(): string {
    return Deno.env.get('ANTIGRAVITY_REFRESH_TOKEN') || '';
  },
  get projectId(): string {
    return Deno.env.get('ANTIGRAVITY_PROJECT_ID') || '';
  },
  get port(): number {
    return parseInt(Deno.env.get('PORT') || '8000');
  },
  get keepThinking(): boolean {
    return Deno.env.get('KEEP_THINKING') === 'true';
  },
  get defaultThinkingBudget(): number {
    return parseInt(Deno.env.get('THINKING_BUDGET') || '16000');
  },
} as const;
```

---

### `src/antigravity/types.ts`

Tipos Gemini/Antigravity e constantes. Extraído e simplificado do projeto original.

```typescript
// ── Gemini Content Types ──

export interface GeminiContentPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
  functionCall?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: { result: unknown };
  };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
}

// ── Antigravity Request Payload ──

export interface AntigravityRequestPayload {
  project: string;
  model: string;
  userAgent: string;
  requestId: string;
  requestType: string;
  request: {
    contents: GeminiContent[];
    tools?: Array<{
      functionDeclarations: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      }>;
    }>;
    generationConfig?: Record<string, unknown>;
    thinking?: {
      type: 'enabled';
      budgetTokens: number;
    };
    systemInstruction?: {
      role: 'user';
      parts: Array<{ text: string }>;
    };
  };
}

// ── OpenAI Request Types (o que o caller envia) ──

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: string };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ── Constantes ──

export const ANTIGRAVITY_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://autopush-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
] as const;

export const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
export const ANTIGRAVITY_CLIENT_SECRET = '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';
export const SKIP_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';
export const DEFAULT_THINKING_BUDGET = 16000;

// ── Model detection helpers ──

export function isClaudeModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('claude') || lower.includes('opus');
}

export function isThinkingCapableModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('thinking')
    || lower.includes('gemini-3')
    || lower.includes('opus');
}

// ── Modelos suportados (pra GET /v1/models) ──

export const SUPPORTED_MODELS = [
  { id: 'gemini-3-flash', owned_by: 'google' },
  { id: 'gemini-3-pro', owned_by: 'google' },
  { id: 'claude-sonnet-4-5', owned_by: 'anthropic' },
  { id: 'claude-opus-4', owned_by: 'anthropic' },
] as const;
```

A diferença principal pro projeto original: os tipos do OpenAI request estão definidos aqui ao invés de usar o SDK da OpenAI como dependência. O proxy é standalone — zero deps externas pesadas.

---

### `src/antigravity/oauth.ts`

Token manager. Praticamente idêntico ao original, é uma peça que funciona bem.

```typescript
import { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET, ANTIGRAVITY_ENDPOINTS } from './types.ts';
import { ENV } from '../util/env.ts';

interface TokenState {
  accessToken: string;
  expiresAt: number;
  projectId: string;
}

const state: TokenState = {
  accessToken: '',
  expiresAt: 0,
  projectId: ENV.projectId,
};

/**
 * Retorna um access token válido, refreshando se necessário.
 * Cache em memória com margem de 60s antes do expire.
 */
export async function getAccessToken(): Promise<string> {
  if (!ENV.refreshToken) {
    throw new Error('ANTIGRAVITY_REFRESH_TOKEN is not set');
  }

  if (state.accessToken && state.expiresAt > Date.now()) {
    return state.accessToken;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      client_secret: ANTIGRAVITY_CLIENT_SECRET,
      refresh_token: ENV.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  state.accessToken = data.access_token;
  state.expiresAt = Date.now() + (data.expires_in * 1000) - 60_000;

  return state.accessToken;
}

/**
 * Retorna o project ID, descobrindo via API se não configurado.
 */
export async function getProjectId(): Promise<string> {
  if (state.projectId) return state.projectId;

  const token = await getAccessToken();

  for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            ideType: 'IDE_UNSPECIFIED',
            platform: 'PLATFORM_UNSPECIFIED',
            pluginType: 'GEMINI',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const projectId = typeof data.cloudaicompanionProject === 'string'
          ? data.cloudaicompanionProject
          : data.cloudaicompanionProject?.id;

        if (projectId) {
          state.projectId = projectId;
          console.log(`[OAuth] Discovered project: ${projectId}`);
          return projectId;
        }
      }
    } catch (e) {
      console.warn(`[OAuth] Discovery failed on ${endpoint}:`, e);
    }
  }

  throw new Error('Could not discover Antigravity project ID. Set ANTIGRAVITY_PROJECT_ID env var.');
}
```

Mudei de singleton class para funções puras com module-level state. Mais simples, mesmo efeito — Deno modules são singletons naturalmente.

---

### `src/antigravity/schemaCleanup.ts`

Limpeza de JSON Schema para compatibilidade Gemini/Claude. São funções puras, sem estado. Portado intacto do `AntigravitySchemaCleanup.ts`.

```typescript
/**
 * Limpeza simples para modelos Gemini.
 * Remove propriedades de JSON Schema não suportadas pela API Gemini.
 */
export function cleanJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...schema };
  const unsupported = [
    'minLength', 'maxLength', 'pattern', 'format',
    'examples', 'default', 'strict', '$schema', 'additionalProperties',
  ];

  for (const key of unsupported) {
    delete cleaned[key];
  }

  if (cleaned.properties && typeof cleaned.properties === 'object') {
    const props = cleaned.properties as Record<string, Record<string, unknown>>;
    for (const key in props) {
      props[key] = cleanJsonSchema(props[key]);
    }
  }

  if (cleaned.items && typeof cleaned.items === 'object') {
    cleaned.items = cleanJsonSchema(cleaned.items as Record<string, unknown>);
  }

  return cleaned;
}

// ── Pipeline completa para Claude (VALIDATED mode) ──

const UNSUPPORTED_CONSTRAINTS = [
  'minLength', 'maxLength', 'exclusiveMinimum', 'exclusiveMaximum',
  'pattern', 'minItems', 'maxItems', 'format', 'default', 'examples',
] as const;

const UNSUPPORTED_KEYWORDS = [
  ...UNSUPPORTED_CONSTRAINTS,
  '$schema', '$defs', 'definitions', 'const', '$ref',
  'additionalProperties', 'propertyNames', 'title', '$id', '$comment',
] as const;

function appendHint(schema: any, hint: string): any {
  if (!schema || typeof schema !== 'object') return schema;
  const existing = typeof schema.description === 'string' ? schema.description : '';
  return { ...schema, description: existing ? `${existing} (${hint})` : hint };
}

function convertRefsToHints(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(convertRefsToHints);

  if (typeof schema.$ref === 'string') {
    const defName = schema.$ref.includes('/') ? schema.$ref.split('/').pop() : schema.$ref;
    const desc = typeof schema.description === 'string' ? schema.description : '';
    const hint = `See: ${defName}`;
    return { type: 'object', description: desc ? `${desc} (${hint})` : hint };
  }

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    result[key] = convertRefsToHints(value);
  }
  return result;
}

function convertConstToEnum(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(convertConstToEnum);

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'const' && !schema.enum) {
      result.enum = [value];
    } else {
      result[key] = convertConstToEnum(value);
    }
  }
  return result;
}

function addEnumHints(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(addEnumHints);

  let result: any = { ...schema };
  if (Array.isArray(result.enum) && result.enum.length > 1 && result.enum.length <= 10) {
    result = appendHint(result, `Allowed: ${result.enum.map(String).join(', ')}`);
  }
  for (const [key, value] of Object.entries(result)) {
    if (key !== 'enum' && typeof value === 'object' && value !== null) {
      result[key] = addEnumHints(value);
    }
  }
  return result;
}

function addAdditionalPropertiesHints(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(addAdditionalPropertiesHints);

  let result: any = { ...schema };
  if (result.additionalProperties === false) {
    result = appendHint(result, 'No extra properties allowed');
  }
  for (const [key, value] of Object.entries(result)) {
    if (key !== 'additionalProperties' && typeof value === 'object' && value !== null) {
      result[key] = addAdditionalPropertiesHints(value);
    }
  }
  return result;
}

function moveConstraintsToDescription(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(moveConstraintsToDescription);

  let result: any = { ...schema };
  for (const constraint of UNSUPPORTED_CONSTRAINTS) {
    if (result[constraint] !== undefined && typeof result[constraint] !== 'object') {
      result = appendHint(result, `${constraint}: ${result[constraint]}`);
    }
  }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = moveConstraintsToDescription(value);
    }
  }
  return result;
}

function mergeAllOf(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(mergeAllOf);

  let result: any = { ...schema };

  if (Array.isArray(result.allOf)) {
    const merged: any = {};
    const mergedRequired: string[] = [];

    for (const item of result.allOf) {
      if (!item || typeof item !== 'object') continue;
      if (item.properties) merged.properties = { ...merged.properties, ...item.properties };
      if (Array.isArray(item.required)) {
        for (const r of item.required) {
          if (!mergedRequired.includes(r)) mergedRequired.push(r);
        }
      }
      for (const [k, v] of Object.entries(item)) {
        if (k !== 'properties' && k !== 'required' && merged[k] === undefined) merged[k] = v;
      }
    }

    if (merged.properties) result.properties = { ...result.properties, ...merged.properties };
    if (mergedRequired.length > 0) {
      result.required = Array.from(new Set([...(result.required || []), ...mergedRequired]));
    }
    for (const [k, v] of Object.entries(merged)) {
      if (k !== 'properties' && k !== 'required' && result[k] === undefined) result[k] = v;
    }
    delete result.allOf;
  }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = mergeAllOf(value);
  }
  return result;
}

function scoreOption(schema: any): { score: number; typeName: string } {
  if (!schema || typeof schema !== 'object') return { score: 0, typeName: 'unknown' };
  if (schema.type === 'object' || schema.properties) return { score: 3, typeName: 'object' };
  if (schema.type === 'array' || schema.items) return { score: 2, typeName: 'array' };
  if (schema.type && schema.type !== 'null') return { score: 1, typeName: schema.type };
  return { score: 0, typeName: schema.type || 'null' };
}

function tryMergeEnumFromUnion(options: any[]): string[] | null {
  if (!Array.isArray(options) || options.length === 0) return null;
  const vals: string[] = [];
  for (const opt of options) {
    if (!opt || typeof opt !== 'object') return null;
    if (opt.const !== undefined) { vals.push(String(opt.const)); continue; }
    if (Array.isArray(opt.enum)) { vals.push(...opt.enum.map(String)); continue; }
    if (opt.properties || opt.items || opt.anyOf || opt.oneOf || opt.allOf) return null;
    if (opt.type && !opt.const && !opt.enum) return null;
  }
  return vals.length > 0 ? vals : null;
}

function flattenAnyOfOneOf(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(flattenAnyOfOneOf);

  let result: any = { ...schema };

  for (const unionKey of ['anyOf', 'oneOf'] as const) {
    if (!Array.isArray(result[unionKey]) || result[unionKey].length === 0) continue;

    const options = result[unionKey];
    const parentDesc = typeof result.description === 'string' ? result.description : '';
    const mergedEnum = tryMergeEnumFromUnion(options);

    if (mergedEnum !== null) {
      const { [unionKey]: _, ...rest } = result;
      result = { ...rest, type: 'string', enum: mergedEnum };
      if (parentDesc) result.description = parentDesc;
      continue;
    }

    let bestIdx = 0, bestScore = -1;
    const allTypes: string[] = [];
    for (let i = 0; i < options.length; i++) {
      const { score, typeName } = scoreOption(options[i]);
      if (typeName) allTypes.push(typeName);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    let selected = flattenAnyOfOneOf(options[bestIdx]) || { type: 'string' };
    if (parentDesc) {
      const childDesc = typeof selected.description === 'string' ? selected.description : '';
      selected = { ...selected, description: childDesc && childDesc !== parentDesc ? `${parentDesc} (${childDesc})` : parentDesc };
    }
    if (allTypes.length > 1) {
      selected = appendHint(selected, `Accepts: ${[...new Set(allTypes)].join(' | ')}`);
    }

    const { [unionKey]: _, description: __, ...rest } = result;
    result = { ...rest, ...selected };
  }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = flattenAnyOfOneOf(value);
  }
  return result;
}

function flattenTypeArrays(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(flattenTypeArrays);

  let result: any = { ...schema };

  if (Array.isArray(result.type)) {
    const types = result.type as string[];
    const hasNull = types.includes('null');
    const nonNull = types.filter((t: string) => t !== 'null' && t);
    result.type = nonNull.length > 0 ? nonNull[0] : 'string';
    if (nonNull.length > 1) result = appendHint(result, `Accepts: ${nonNull.join(' | ')}`);
    if (hasNull) result = appendHint(result, 'nullable');
  }

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = flattenTypeArrays(value);
  }
  return result;
}

function removeUnsupportedKeywords(schema: any, insideProperties = false): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map((item) => removeUnsupportedKeywords(item, false));

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!insideProperties && (UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) continue;
    if (typeof value === 'object' && value !== null) {
      result[key] = key === 'properties'
        ? Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, removeUnsupportedKeywords(v, false)]))
        : removeUnsupportedKeywords(value, false);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function cleanupRequiredFields(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(cleanupRequiredFields);

  let result: any = { ...schema };
  if (Array.isArray(result.required) && result.properties && typeof result.properties === 'object') {
    const valid = result.required.filter((r: string) => r in result.properties);
    if (valid.length === 0) delete result.required;
    else result.required = valid;
  }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = cleanupRequiredFields(value);
  }
  return result;
}

function addEmptySchemaPlaceholder(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(addEmptySchemaPlaceholder);

  let result: any = { ...schema };
  if (result.type === 'object') {
    const hasProps = result.properties && typeof result.properties === 'object' && Object.keys(result.properties).length > 0;
    if (!hasProps) {
      result.properties = { _placeholder: { type: 'boolean', description: 'Placeholder for empty schema' } };
      result.required = ['_placeholder'];
    }
  }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) result[key] = addEmptySchemaPlaceholder(value);
  }
  return result;
}

/**
 * Pipeline completa de limpeza para Claude VALIDATED mode.
 * Transforma features não suportadas em description hints.
 */
export function cleanJSONSchemaForAntigravity(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;

  let result = schema;
  result = convertRefsToHints(result);
  result = convertConstToEnum(result);
  result = addEnumHints(result);
  result = addAdditionalPropertiesHints(result);
  result = moveConstraintsToDescription(result);
  result = mergeAllOf(result);
  result = flattenAnyOfOneOf(result);
  result = flattenTypeArrays(result);
  result = removeUnsupportedKeywords(result);
  result = cleanupRequiredFields(result);
  result = addEmptySchemaPlaceholder(result);
  return result;
}
```

---

### `src/antigravity/transformer.ts`

Coração do proxy. Traduz OpenAI ↔ Gemini em ambas as direções.

```typescript
import type {
  GeminiContent,
  GeminiContentPart,
  OpenAIMessage,
  OpenAITool,
} from './types.ts';
import { SKIP_THOUGHT_SIGNATURE, isClaudeModel } from './types.ts';
import { cleanJsonSchema, cleanJSONSchemaForAntigravity } from './schemaCleanup.ts';

/**
 * Converte array de mensagens OpenAI para formato Gemini.
 *
 * Mapeamento:
 *   system        → extraído como systemInstruction (separado)
 *   user          → role: 'user', parts: [{ text }] ou [{ inlineData }]
 *   assistant     → role: 'model', parts: [{ text }]
 *   assistant+tc  → role: 'model', parts: [{ functionCall }]
 *   tool          → role: 'user', parts: [{ functionResponse }]
 */
export function toGeminiFormat(
  messages: OpenAIMessage[],
): { systemInstruction?: string; contents: GeminiContent[] } {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];
  // Mapeia nome de função → fila de IDs pendentes (pra associar tool results)
  const pendingCallIdsByName = new Map<string, string[]>();

  for (const msg of messages) {
    // ── System → systemInstruction ──
    if (msg.role === 'system') {
      systemInstruction = typeof msg.content === 'string' ? msg.content : '';
      continue;
    }

    // ── Assistant com tool_calls → model com functionCall parts ──
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const parts: GeminiContentPart[] = [];

      // Se tem content junto com tool_calls (raro mas válido)
      if (msg.content && typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      }

      for (const call of msg.tool_calls) {
        const callId = call.id || `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
        const callName = call.function?.name || 'unknown';
        const callArgs = call.function?.arguments || '{}';

        // Enfileira o ID pra associar com o tool result depois
        const queue = pendingCallIdsByName.get(callName) || [];
        queue.push(callId);
        pendingCallIdsByName.set(callName, queue);

        parts.push({
          functionCall: {
            id: callId,
            name: callName,
            args: typeof callArgs === 'string' ? JSON.parse(callArgs) : callArgs,
          },
          // Sem signatureMap no proxy (stateless), usa sentinel
          thoughtSignature: SKIP_THOUGHT_SIGNATURE,
        });
      }

      contents.push({ role: 'model', parts });
      continue;
    }

    // ── Tool result → user com functionResponse ──
    if (msg.role === 'tool') {
      const toolName = msg.name || 'unknown';
      const queue = pendingCallIdsByName.get(toolName);
      const matchedId = queue && queue.length > 0 ? queue.shift() : undefined;

      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            id: matchedId || msg.tool_call_id || 'unknown',
            name: toolName,
            response: { result: msg.content },
          },
        }],
      });
      continue;
    }

    // ── User/Assistant regular → user/model com text/inlineData ──
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiContentPart[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text' && item.text) {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url' && item.image_url) {
          const url = typeof item.image_url === 'string' ? item.image_url : item.image_url.url;
          // Extrai base64 data URI: data:image/jpeg;base64,/9j/4AAQ...
          const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
          // URLs HTTP de imagem não são suportadas pelo Antigravity inline
          // O caller precisa converter pra base64 antes
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return { systemInstruction, contents };
}

/**
 * Converte tool schemas OpenAI → functionDeclarations Gemini.
 *
 * Aplica limpeza de schema diferente dependendo do modelo:
 *   - Claude/Opus: cleanJSONSchemaForAntigravity (pipeline completa, VALIDATED mode)
 *   - Gemini:      cleanJsonSchema (remove props simples)
 */
export function toGeminiTools(
  tools: OpenAITool[],
  model: string,
): Array<{ functionDeclarations: Array<{ name: string; description: string; parameters: Record<string, unknown> }> }> {
  const claude = isClaudeModel(model);

  return [{
    functionDeclarations: tools.map((tool) => {
      const params = tool.function?.parameters || {};
      const cleanedParams = claude
        ? cleanJSONSchemaForAntigravity(params)
        : cleanJsonSchema(typeof params === 'object' ? params : {});

      return {
        name: tool.function?.name || 'unknown',
        description: tool.function?.description || '',
        parameters: cleanedParams,
      };
    }),
  }];
}
```

A diferença crucial pro projeto original: não tem `signatureMap` porque o proxy é stateless. Cada request é independente. Todo `functionCall` no histórico recebe `SKIP_THOUGHT_SIGNATURE` como sentinel.

---

### `src/antigravity/client.ts`

Client HTTP com fallback de endpoints.

```typescript
import { ANTIGRAVITY_ENDPOINTS } from './types.ts';
import { getAccessToken } from './oauth.ts';

const HEADERS_BASE = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/1.16.5 Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata': JSON.stringify({ ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' }),
  'Accept': 'text/event-stream',
  'anthropic-beta': 'interleaved-thinking-2025-05-14',
} as const;

/**
 * Faz request streaming pro Antigravity com fallback entre endpoints.
 * Tenta daily → autopush → prod. Se 429 ou 5xx, vai pro próximo.
 */
export async function makeAntigravityRequest(
  payload: Record<string, unknown>,
  endpointIndex = 0,
): Promise<Response> {
  const accessToken = await getAccessToken();
  const endpoint = ANTIGRAVITY_ENDPOINTS[endpointIndex];
  const url = `${endpoint}/v1internal:streamGenerateContent?alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS_BASE,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  // Fallback pro próximo endpoint em caso de rate limit ou server error
  if ((response.status === 429 || response.status >= 500) && endpointIndex < ANTIGRAVITY_ENDPOINTS.length - 1) {
    console.warn(`[Client] Endpoint ${endpoint} returned ${response.status}, trying next...`);
    return makeAntigravityRequest(payload, endpointIndex + 1);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Antigravity API error (${response.status}): ${errorText}`);
  }

  return response;
}
```

---

### `src/antigravity/streamTransformer.ts`

Transforma o stream SSE Gemini → formato OpenAI. Esta é a parte mais complexa.

```typescript
import { ENV } from '../util/env.ts';

interface StreamContext {
  toolCallIndex: number;
  emittedFunctionCalls: Set<number>; // deduplica por posição no array de parts
}

/**
 * Transforma um ReadableStream SSE do Antigravity (formato Gemini)
 * em um ReadableStream SSE no formato OpenAI Chat Completions.
 *
 * Gemini manda:
 *   data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}
 *
 * OpenAI espera:
 *   data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
 *
 * Complexidades:
 *   - Gemini manda parts cumulativos (cada chunk contém TODOS os parts até agora)
 *   - functionCalls precisam ser deduplicados por posição no array
 *   - Thinking blocks (part.thought=true) são filtrados por padrão
 *   - functionCall.args pode conter __thinking_text que precisa ser removido
 */
export function transformGeminiToOpenAIStream(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const reader = body.getReader();
      const ctx: StreamContext = {
        toolCallIndex: 0,
        emittedFunctionCalls: new Set(),
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            processLine(line.trim(), controller, encoder, ctx);
          }
        }

        // Processa buffer restante
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data:')) {
            processLine(trimmed, controller, encoder, ctx);
          } else if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            // Alguns endpoints retornam JSON raw ao invés de SSE
            try {
              const items = JSON.parse(trimmed);
              const arr = Array.isArray(items) ? items : [items];
              for (const data of arr) {
                processGeminiChunk(data, controller, encoder, ctx);
              }
            } catch { /* skip */ }
          }
        }

        // Chunk final: stop
        emitOpenAIChunk(controller, encoder, { choices: [{ delta: {}, finish_reason: 'stop' }] });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        emitOpenAIChunk(controller, encoder, {
          choices: [{ delta: { content: `\n\nStream error: ${msg}` }, finish_reason: 'stop' }],
        });
      } finally {
        controller.close();
      }
    },
  });
}

function processLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: StreamContext,
): void {
  if (!line || !line.startsWith('data:')) return;

  const jsonText = line.substring(5).trim();
  if (!jsonText || jsonText === '[DONE]') return;

  try {
    const data = JSON.parse(jsonText);
    processGeminiChunk(data, controller, encoder, ctx);
  } catch { /* skip unparseable */ }
}

/**
 * Processa um chunk Gemini e emite 0+ chunks OpenAI.
 *
 * O Gemini retorna em dois formatos possíveis:
 *   { response: { candidates: [...] } }   (SSE wrapper)
 *   { candidates: [...] }                  (direto)
 *
 * Cada candidate tem content.parts[], onde cada part pode ser:
 *   { text: "...", thought?: boolean }      → delta.content
 *   { functionCall: { name, args } }        → delta.tool_calls
 */
function processGeminiChunk(
  data: any,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: StreamContext,
): void {
  // Suporta ambos os formatos de resposta
  const parts = data.response?.candidates?.[0]?.content?.parts
    || data.candidates?.[0]?.content?.parts;
  if (!parts) return;

  const keepThinking = ENV.keepThinking;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // ── Text part ──
    if (part.text) {
      // Filtra thinking blocks (a não ser que KEEP_THINKING=true)
      if (part.thought === true && !keepThinking) continue;

      emitOpenAIChunk(controller, encoder, {
        choices: [{ delta: { content: part.text }, finish_reason: null }],
      });
    }

    // ── Function Call part ──
    if (part.functionCall) {
      // Deduplica: Gemini manda parts cumulativos, então o functionCall
      // na posição i já foi emitido em um chunk anterior
      if (ctx.emittedFunctionCalls.has(i)) continue;

      // Remove __thinking_text dos args (campo interno do Antigravity)
      const { __thinking_text, ...cleanArgs } = part.functionCall.args || {};

      const callId = `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

      emitOpenAIChunk(controller, encoder, {
        choices: [{
          delta: {
            tool_calls: [{
              index: ctx.toolCallIndex,
              id: callId,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(cleanArgs),
              },
            }],
          },
          finish_reason: null,
        }],
      });

      ctx.emittedFunctionCalls.add(i);
      ctx.toolCallIndex++;
    }
  }
}

function emitOpenAIChunk(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  data: Record<string, unknown>,
): void {
  controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
}
```

Pontos cruciais explicados nos comentários inline:

1. **Deduplicação por posição**: O Gemini manda chunks cumulativos — se no chunk 1 ele manda `[partA]`, no chunk 2 ele manda `[partA, partB]`. O `emittedFunctionCalls` Set rastreia por index no array de parts pra não re-emitir o mesmo functionCall.

2. **Text é re-emitido**: Pra text, não deduplicamos — é mais seguro re-emitir do que perder texto. O caller que consome o stream espera deltas incrementais, mas no pior caso recebe texto duplicado (que é melhor que perder).

3. **`__thinking_text`**: O Antigravity injeta um campo `__thinking_text` nos args do functionCall em modelos thinking. Precisa ser removido antes de devolver pro caller.

---

### `src/routes/chatCompletions.ts`

O handler principal. Conecta tudo.

```typescript
import type { Context } from 'hono';
import type { AntigravityRequestPayload, OpenAIChatRequest } from '../antigravity/types.ts';
import {
  DEFAULT_THINKING_BUDGET,
  isClaudeModel,
  isThinkingCapableModel,
} from '../antigravity/types.ts';
import { toGeminiFormat, toGeminiTools } from '../antigravity/transformer.ts';
import { makeAntigravityRequest } from '../antigravity/client.ts';
import { getProjectId } from '../antigravity/oauth.ts';
import { transformGeminiToOpenAIStream } from '../antigravity/streamTransformer.ts';

export async function chatCompletions(c: Context): Promise<Response> {
  let body: OpenAIChatRequest;
  try {
    body = await c.req.json<OpenAIChatRequest>();
  } catch {
    return c.json({ error: { message: 'Invalid JSON body' } }, 400);
  }

  // Validação básica
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: { message: 'messages is required and must be a non-empty array' } }, 400);
  }

  const model = body.model || 'gemini-3-flash';
  const stream = body.stream !== false; // default true
  const claude = isClaudeModel(model);
  const thinking = isThinkingCapableModel(model);

  try {
    // 1. Traduz mensagens OpenAI → Gemini
    const { systemInstruction, contents } = toGeminiFormat(body.messages);

    // 2. Traduz tools OpenAI → functionDeclarations Gemini
    const tools = body.tools && body.tools.length > 0
      ? toGeminiTools(body.tools, model)
      : undefined;

    // 3. Monta generation config
    const generationConfig: Record<string, unknown> = {};
    if (body.max_tokens) generationConfig.maxOutputTokens = body.max_tokens;
    if (body.temperature !== undefined) generationConfig.temperature = body.temperature;
    if (body.top_p !== undefined) generationConfig.topP = body.top_p;
    if (body.stop) generationConfig.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];

    // Thinking config para Gemini (vai dentro do generationConfig)
    if (thinking && !claude) {
      generationConfig.thinkingConfig = {
        thinkingBudget: DEFAULT_THINKING_BUDGET,
        includeThoughts: true,
      };
    }

    // 4. Monta payload Antigravity
    const projectId = await getProjectId();
    const payload: AntigravityRequestPayload = {
      project: projectId,
      model,
      userAgent: 'antigravity',
      requestId: `req-${crypto.randomUUID()}`,
      requestType: 'agent',
      request: {
        contents,
        ...(tools ? { tools } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
        // Thinking config para Claude/Opus (vai fora do generationConfig)
        ...(thinking && claude ? {
          thinking: {
            type: 'enabled' as const,
            budgetTokens: DEFAULT_THINKING_BUDGET,
          },
        } : {}),
        ...(systemInstruction ? {
          systemInstruction: { role: 'user' as const, parts: [{ text: systemInstruction }] },
        } : {}),
      },
    };

    // 5. Faz request pro Antigravity
    const response = await makeAntigravityRequest(payload as unknown as Record<string, unknown>);

    if (!response.body) {
      return c.json({ error: { message: 'No response body from Antigravity' } }, 502);
    }

    // 6. Retorna no formato OpenAI
    if (stream) {
      return streamResponse(c, response.body, model);
    } else {
      return await nonStreamResponse(c, response.body, model);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ChatCompletions] Error:', msg);
    return c.json({ error: { message: msg } }, 500);
  }
}

/**
 * Retorna SSE stream no formato OpenAI.
 * Cada chunk: "data: {json}\n\n"
 * Final:      "data: [DONE]\n\n"
 */
function streamResponse(c: Context, body: ReadableStream<Uint8Array>, model: string): Response {
  const openaiStream = transformGeminiToOpenAIStream(body);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const requestId = `chatcmpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 29)}`;

  const sseStream = new ReadableStream({
    start: async (controller) => {
      const reader = openaiStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Cada linha do stream interno é um JSON chunk
          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n').filter((l) => l.trim());

          for (const line of lines) {
            try {
              const chunk = JSON.parse(line);
              // Enriquece com id, model, object, created
              const enriched = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                ...chunk,
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(enriched)}\n\n`));
            } catch {
              // Se não é JSON, pula
            }
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        console.error('[Stream] Error:', error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Consome o stream inteiro, acumula content e tool_calls,
 * e retorna um response completo no formato OpenAI.
 */
async function nonStreamResponse(
  c: Context,
  body: ReadableStream<Uint8Array>,
  model: string,
): Promise<Response> {
  const openaiStream = transformGeminiToOpenAIStream(body);
  const reader = openaiStream.getReader();
  const decoder = new TextDecoder();

  let fullContent = '';
  const toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
  let finishReason = 'stop';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      try {
        const chunk = JSON.parse(line);
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.delta?.content) {
          fullContent += choice.delta.content;
        }

        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            // Cada tool_call vem completa num único chunk (não fragmentada)
            if (tc.id && tc.function?.name) {
              toolCalls.push({
                id: tc.id,
                type: tc.type || 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments || '{}',
                },
              });
            }
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      } catch { /* skip */ }
    }
  }

  // Se tem tool_calls, finish_reason é 'tool_calls'
  if (toolCalls.length > 0) {
    finishReason = 'tool_calls';
  }

  const message: Record<string, unknown> = {
    role: 'assistant',
    content: fullContent || null,
  };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  return c.json({
    id: `chatcmpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 29)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason,
    }],
    // Antigravity não retorna usage no stream, então fica zerado
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  });
}
```

---

### `src/routes/models.ts`

Simples. Lista modelos disponíveis.

```typescript
import type { Context } from 'hono';
import { SUPPORTED_MODELS } from '../antigravity/types.ts';

export function listModels(c: Context): Response {
  return c.json({
    object: 'list',
    data: SUPPORTED_MODELS.map((m) => ({
      id: m.id,
      object: 'model',
      created: 1700000000,
      owned_by: m.owned_by,
    })),
  });
}
```

---

### `.env.example`

```bash
# Obrigatório: refresh token do Google OAuth (obtido do Antigravity)
ANTIGRAVITY_REFRESH_TOKEN=1//0abc...

# Opcional: project ID (auto-descoberto se não setado)
ANTIGRAVITY_PROJECT_ID=

# Porta do servidor
PORT=8000

# Manter thinking blocks na resposta (default: false)
KEEP_THINKING=false

# Budget de tokens para thinking (default: 16000)
THINKING_BUDGET=16000
```

---

### `Dockerfile`

```dockerfile
FROM denoland/deno:2.1.4

WORKDIR /app
COPY . .

RUN deno cache src/main.ts

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "src/main.ts"]
```

### `docker-compose.yml`

```yaml
services:
  proxy:
    build: .
    ports:
      - "8000:8000"
    env_file:
      - .env
    restart: unless-stopped
```

---

### Resumo das Diferenças do Projeto Original

| Aspecto | Projeto Original | Proxy Novo |
|---------|-----------------|------------|
| `signatureMap` / cache | Sim, mantém entre requests | Não — cada request é stateless, usa `SKIP_THOUGHT_SIGNATURE` |
| `AgentLoopExecutor` | Sim, executa tools e faz loops | Não — o caller controla o loop |
| `ChatRepository` | Sim, persiste histórico | Não — o caller manda histórico no messages |
| `ToolService` | Sim, tools próprias do bot | Não — tools vêm do caller no body |
| Thinking signatures | Cache complexo com TTL | Ignoradas — sentinel pra tudo |
| `filterUnsignedThinkingBlocks` | Sim, filtra/restaura signatures | Não necessário — sem sessão |
| Formato de saída | Stream interno pro Telegram | SSE padrão OpenAI + non-streaming |

O proxy é essencialmente as funções `toGeminiFormat`, `toGeminiTools`, `processGeminiChunk` e `makeRequest` extraídas e simplificadas num servidor HTTP standalone, sem nenhuma lógica de negócio — só tradução de formato ida e volta.Pronto Lucas. Esse é o projeto completo linha a linha — 10 arquivos, ~600 linhas de código. Quer que eu implemente e salve na pasta do projeto, ou prefere criar um repo separado?
