export interface GeminiContentPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: {
    mimeType: string;
    data: string;
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

export interface AntigravityRequestPayload {
  project?: string;
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

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  reasoning_effort?: 'low' | 'medium' | 'high' | 'minimal';
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

export const ANTIGRAVITY_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://autopush-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
] as const;

export const SKIP_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';
export const DEFAULT_THINKING_BUDGET = 16000;

export const REASONING_EFFORT_BUDGETS = {
  low: 8192,
  medium: 16384,
  high: 32768,
} as const;

/**
 * Checks if the given model name refers to a Claude model.
 *
 * @param model - The model identifier to check.
 * @returns True if it's a Claude model, false otherwise.
 */
export function isClaudeModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('claude') || lower.includes('opus');
}

/**
 * Checks if the given model is capable of thinking/reasoning blocks.
 *
 * @param model - The model identifier to check.
 * @returns True if the model supports thinking, false otherwise.
 */
export function isThinkingCapableModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('thinking')
    || lower.includes('gemini-3')
    || lower.includes('opus');
}

const ANTIGRAVITY_VERSION = "1.15.8";

const ANTIGRAVITY_PLATFORMS = [
  "windows/amd64",
  "darwin/arm64",
  "linux/amd64",
  "darwin/amd64",
  "linux/arm64",
] as const;

const ANTIGRAVITY_USER_AGENTS = ANTIGRAVITY_PLATFORMS.map(
  platform => `antigravity/${ANTIGRAVITY_VERSION} ${platform}`
);

const ANTIGRAVITY_API_CLIENTS = [
  "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "google-cloud-sdk vscode/1.96.0",
  "google-cloud-sdk jetbrains/2024.3",
  "google-cloud-sdk vscode/1.95.0",
] as const;

const GEMINI_CLI_USER_AGENTS = [
  "google-api-nodejs-client/9.15.1",
  "google-api-nodejs-client/9.14.0",
  "google-api-nodejs-client/9.13.0",
] as const;

const GEMINI_CLI_API_CLIENTS = [
  "gl-node/22.17.0",
  "gl-node/22.12.0",
  "gl-node/20.18.0",
  "gl-node/21.7.0",
] as const;

const GEMINI_CLI_CLIENT_METADATA = "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI";

export type HeaderStyle = "antigravity" | "gemini-cli";

export function getRandomizedHeaders(style: HeaderStyle): Record<string, string> {
  const randomFrom = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

  if (style === "gemini-cli") {
    return {
      "User-Agent": randomFrom(GEMINI_CLI_USER_AGENTS),
      "X-Goog-Api-Client": randomFrom(GEMINI_CLI_API_CLIENTS),
      "Client-Metadata": GEMINI_CLI_CLIENT_METADATA,
    };
  }

  return {
    "User-Agent": randomFrom(ANTIGRAVITY_USER_AGENTS),
    "X-Goog-Api-Client": randomFrom(ANTIGRAVITY_API_CLIENTS),
    "Client-Metadata": JSON.stringify({
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    }),
  };
}

export function resolveModelForHeaderStyle(model: string, style: HeaderStyle): string {
  if (style === "antigravity") return model;

  const withoutTier = model.replace(/-(low|medium|high|minimal)$/i, "");

  if (withoutTier.toLowerCase().includes("gemini-3") && !withoutTier.endsWith("-preview")) {
    return `${withoutTier}-preview`;
  }

  return withoutTier;
}

export const ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";

export const SUPPORTED_MODELS = [
  { id: 'gemini-3-flash', owned_by: 'google' },
  { id: 'gemini-3-pro', owned_by: 'google' },
  { id: 'claude-sonnet-4-5', owned_by: 'anthropic' },
  { id: 'claude-opus-4-5', owned_by: 'anthropic' },
] as const;
