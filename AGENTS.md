# Antigravity OpenAI Proxy - Agent Guidelines

This document provides essential instructions for AI agents working on this codebase.

## 🛠 Commands

This project uses **Deno**.

- **Run development server**: `deno task dev`
- **Start production server**: `deno task start`
- **Obtain Google Refresh Token**: `deno task antigravity-login`
- **Run all tests**: `deno task test`
- **Run a single test file**: `deno test --allow-net --allow-env --allow-read tests/unit/toGeminiFormat.test.ts`
- **Run tests matching a pattern**: `deno test --allow-net --allow-env --allow-read --filter "Conversão"`
- **Cache dependencies**: `deno cache src/main.ts`

## 💻 Code Style Guidelines

### 1. TypeScript & Types
- Use TypeScript for all new files.
- Avoid `any` whenever possible. Use `unknown` or define proper interfaces.
- Prefer interfaces over types for public-facing structures.
- Use explicit return types for exported functions.

### 2. Imports
- Always group imports at the top of the file.
- Use absolute-like paths if configured or relative paths starting with `./` or `../`.
- Do not use fully qualified names in the code body; import the class/type first.

### 3. Formatting
- Use 2 spaces for indentation.
- No semicolons (as per Deno/standard style observed in the project). Wait, looking at current code, it DOES use semicolons. Stick to semicolons.
- Use trailing commas in multi-line arrays and objects.

### 4. Naming Conventions
- **Variables & Functions**: `camelCase`.
- **Classes & Interfaces**: `PascalCase`.
- **Files**: `camelCase.ts` or `PascalCase.ts`.
- **Constants**: `UPPER_SNAKE_CASE`.

### 5. Clean Code & Functions
- Keep functions small and focused (Single Responsibility Principle).
- Prefer Composition over Inheritance.
- Do not add comments explaining *what* the code does (unless complex logic); the code should be self-explanatory.
- Always include TSDoc comments for functions:
  ```typescript
  /**
   * Summarizes the purpose.
   * @param paramName - Description.
   * @returns Description of return value.
   */
  ```

### 6. Error Handling
- Use exceptions rather than error codes.
- Implement meaningful error messages.
- For API routes, return clear JSON error responses with appropriate HTTP status codes (400, 401, 404, 500).

### 7. Security
- Use `src/util/env.ts` to access environment variables.
- Ensure all routes requiring authentication extract the token from the `Authorization` header.

## 🧪 Test Conventions

Follow the **AAA (Arrange, Act, Assert)** pattern.

### Structure
- Use `Deno.test` with clear, descriptive names.
- Group related tests using `describe` or nested tests if using a library, otherwise use clear naming prefixes.
- Use `assertEquals`, `assertExists`, etc., from `asserts`.

### Example
```typescript
Deno.test('@DisplayName("Conversão de mensagem de sistema")', () => {
  // Arrange
  const messages = [{ role: 'system', content: 'You are a helpful assistant' }];

  // Act
  const result = toGeminiFormat(messages);

  // Assert
  assertEquals(result.systemInstruction, 'You are a helpful assistant');
});
```

### Naming
- Test names should be in Portuguese if using `@DisplayName` format, following: `should<ExpectedOutcome>[_when<Condition>]`.
- Example: `@DisplayName("Deve converter mensagem de sistema")`.

## 🚀 Environment Variables

Accessed via `ENV` object in `src/util/env.ts`:
- `PORT`: Server port.
- `KEEP_THINKING`: Boolean to preserve thinking blocks.
- `THINKING_BUDGET`: Token budget for reasoning models.

## 🔐 Comando antigravity-login

### Como usar

Execute `deno task antigravity-login` para obter um Google Refresh Token através do fluxo OAuth2.

### Como funciona

1. O comando exibe uma URL de autorização OAuth no terminal
2. Você deve abrir a URL no navegador e autorizar o acesso à conta Google
3. O navegador redireciona para `http://localhost:9004` com o código de autorização
4. O servidor local (porta 9004) captura o código e o troca por um refresh token
5. O refresh token é exibido no terminal

### O que esperar

- Uma URL será exibida no terminal
- Um servidor local será iniciado na porta 9004
- Após autorizar no navegador, você verá uma mensagem de sucesso
- O refresh token será exibido no terminal para copiar
- Use o refresh token como API Key no header `Authorization: Bearer <TOKEN>`

### Notas

- O servidor na porta 9004 é temporário e encerra após capturar o código
- O refresh token obtido pode ser usado indefinidamente (não expira)
- Mantenha o refresh token seguro, pois dá acesso à sua conta Google Cloud

## 🔄 OAuth Token Cache

### Visão Geral

O sistema de cache de tokens OAuth em `src/antigravity/oauth.ts` implementa um cache multi-usuário com as seguintes características:

- **Multi-usuário**: Cada `refreshToken` possui sua própria entrada no cache
- **TTL automático**: Tokens expiram após `expires_in - 60s` (buffer de segurança)
- **LRU eviction**: Cache com limite de 1000 entradas, removendo as menos usadas recentemente
- **Cleanup periódico**: Entradas expiradas são removidas a cada 5 minutos
- **Race condition protection**: Múltiplas requisições simultâneas do mesmo token compartilham a mesma promise de refresh

### Métricas

O endpoint `/metrics` expõe as seguintes métricas do cache:

```json
{
  "oauth": {
    "cache": {
      "hits": 100,
      "misses": 5,
      "refreshes": 3,
      "evictedByCleanup": 10,
      "evictedByLRU": 2
    }
  }
}
```

- **hits**: Número de vezes que um token válido foi retornado do cache
- **misses**: Número de vezes que um token expirado ou ausente precisou de refresh
- **refreshes**: Número total de operações de refresh realizadas
- **evictedByCleanup**: Número de entradas removidas por expiração
- **evictedByLRU**: Número de entradas removidas por limite de cache

### Tratamento de Erros

O sistema diferencia entre tipos de erro durante o refresh:

- **Invalid token (400, 401)**: Remove entrada do cache e lança erro
- **Rate limit (429)**: Lança erro sem remover entrada (para retry posterior)
- **Network error**: Lança erro sem remover entrada (para retry posterior)

### Notas de Implementação

- O cleanup timer é iniciado automaticamente na primeira chamada de `getAccessToken()`
- Use `clearTokenCache()` para limpar todo o cache (útil em testes)
- Use `stopCleanupTimer()` para parar o timer de cleanup
- Cada entrada do cache inclui `lastAccessedAt` para implementação do LRU

## 🧠 Suporte ao `reasoning_effort` (OpenAI)

### Visão Geral

O proxy suporta o parâmetro `reasoning_effort` do OpenAI para controlar o nível de raciocínio em modelos thinking (o1, o1-mini, Gemini 3, Claude).

### Mapeamento por Modelo

#### Gemini 3 Pro
- Usa **sufixo no nome do modelo**: `gemini-3-pro-{level}`
- Níveis suportados: `low`, `high`
- Mapeamento:
  - `low` → `gemini-3-pro-low`
  - `medium` → `gemini-3-pro-low` (limitação do modelo)
  - `high` → `gemini-3-pro-high`
  - `undefined` → `gemini-3-pro-low` (default)
  - `minimal` → `gemini-3-pro-low`

#### Gemini 3 Flash
- Usa **sufixo no nome do modelo**: `gemini-3-flash-{level}`
- Níveis suportados: `minimal`, `low`, `medium`, `high`
- Mapeamento:
  - `minimal` → `gemini-3-flash-minimal`
  - `low` → `gemini-3-flash-low`
  - `medium` → `gemini-3-flash-medium`
  - `high` → `gemini-3-flash-high`
  - `undefined` → `gemini-3-flash-medium` (default)

#### Claude Thinking (Opus 4)
- Usa **budget numérico de tokens**: `thinking.budgetTokens`
- Mapeamento:
  - `low` → 8192 tokens
  - `medium` → 16384 tokens
  - `high` → 32768 tokens
  - `minimal` → 8192 tokens
  - `undefined` → 16000 tokens (DEFAULT_THINKING_BUDGET)

#### Gemini 2.5 (Pro/Flash)
- Usa **budget numérico de tokens**: `generationConfig.thinkingConfig.thinkingBudget`
- Mesmo mapeamento do Claude Thinking

### Implementação

**Arquivos:**
- `src/antigravity/types.ts`: Define `OpenAIChatRequest.reasoning_effort` e constantes `REASONING_EFFORT_BUDGETS`
- `src/routes/chatCompletions.ts`: Funções de mapeamento e lógica de aplicação

**Funções de Mapeamento:**
- `mapReasoningEffortToGemini3Pro()`: Mapeia para string de sufixo
- `mapReasoningEffortToGemini3Flash()`: Mapeia para string de sufixo
- `mapReasoningEffortToTokenBudget()`: Mapeia para número de tokens
- `normalizeModelForAntigravity()`: Adiciona sufixo ao nome do modelo para Gemini 3

### Exemplo de Uso

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer $ANTIGRAVITY_REFRESH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro",
    "messages": [{"role": "user", "content": "Explique a relatividade"}],
    "reasoning_effort": "high"
  }'
```

Resultado interno: `gemini-3-pro-high` será enviado para a API do Antigravity.

### Testes

Execute a bateria completa de testes:
```bash
deno task test
```

### Notas Importantes

- Para **Gemini 3**, o `reasoning_effort` é aplicado via **sufixo no nome do modelo**, não via `generationConfig`
- Para **Gemini 2.5** e **Claude**, o `reasoning_effort` controla o `thinkingBudget` numérico
- A implementação é **backward compatible**: clientes sem o parâmetro funcionam normalmente
- SDKs OpenAI podem enviar o parâmetro nativamente sem modificações

## 📁 Project Structure

- `src/main.ts`: Application entry point.
- `src/cli/`: CLI commands (antigravity-login).
- `src/routes/`: Hono route handlers (Chat Completions, Models).
- `src/antigravity/`: Core logic for Antigravity API integration.
  - `client.ts`: HTTP client with endpoint fallback.
  - `oauth.ts`: Token management and project discovery.
  - `transformer.ts`: Conversions between OpenAI and Gemini formats.
  - `streamTransformer.ts`: SSE stream transformation logic.
  - `types.ts`: Shared interfaces and constants.
- `src/util/`: Helper utilities and environment configuration.
- `tests/`: Test suite organized by category (unit, integration, contract).

## 🛑 Error Handling Patterns

### API Errors
When returning errors from routes, use the OpenAI-compatible format:
```typescript
return c.json({ 
  error: { 
    message: "Human readable message",
    type: "invalid_request_error",
    code: "invalid_value"
  } 
}, 400);
```

### Internal Logic
Wrap external API calls in try-catch blocks and provide context:
```typescript
try {
  const res = await makeAntigravityRequest(payload, token);
} catch (error) {
  throw new Error(`Failed to process request: ${error.message}`);
}
```

## 🧩 Dependency Management

- Use `deno.json` for imports and tasks.
- Avoid importing directly from URLs in the code; use the `imports` map in `deno.json`.
- Keep dependencies updated and follow the `deno.lock` file.

## 📝 Documentation

- Keep `AGENTS.md` updated when introducing new patterns or major architecture changes.
- Use JSDoc/TSDoc for all exported entities.
- Document complex regex or stream transformation logic inline.

## 🤖 Agent Workflow
1. **Analyze**: Read existing code and types before proposing changes.
2. **Plan**: Describe what you will do.
3. **Execute**: Apply changes using `Edit` or `Write`.
4. **Verify**: Run relevant tests (`deno test ...`).
5. **Lint**: Ensure no type errors (`deno cache src/main.ts`).
6. **Refactor**: Simplify code if the implementation becomes too complex.
