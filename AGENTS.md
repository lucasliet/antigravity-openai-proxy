# Antigravity OpenAI Proxy - Agent Guidelines

This document provides essential instructions for AI agents working on this codebase.

## 🛠 Commands

This project uses **Deno**.

- **Run development server**: `deno task dev`
- **Start production server**: `deno task start`
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

## 📁 Project Structure

- `src/main.ts`: Application entry point.
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
