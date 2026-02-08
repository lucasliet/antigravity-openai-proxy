# Antigravity OpenAI Proxy

Um proxy leve para converter requisições no formato **OpenAI API** para a API interna do **Antigravity** (Google Cloud Code/Gemini).

## ✨ Funcionalidades

- **Multi-usuário**: Suporta múltiplos tokens de refresh via cabeçalho `Authorization`.
- **Compatibilidade OpenAI**: Funciona com o SDK oficial da OpenAI e ferramentas compatíveis.
- **Streaming**: Suporte total a Server-Sent Events (SSE).
- **Thinking Support**: Suporte a modelos que geram blocos de pensamento (Gemini 3, Claude).
- **Tool Calling**: Conversão de definições de ferramentas (JSON Schema) para o formato Gemini/Antigravity.
- **Failover**: Tentativa automática em múltiplos endpoints (Daily, Autopush, Prod).

## 🚀 Como usar

### Pré-requisitos
- [Deno](https://deno.com/) instalado.
- Credenciais OAuth do Google (Client ID e Secret).

### Configuração
Crie um arquivo `.env` baseado no `.env.example`:
```bash
ANTIGRAVITY_CLIENT_ID=seu_client_id
ANTIGRAVITY_CLIENT_SECRET=seu_client_secret
PORT=8000
```

### Rodando o Servidor
```bash
deno task dev
```

### Exemplo com SDK OpenAI
```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "seu_google_refresh_token"
});

const response = await client.chat.completions.create({
  model: "gemini-3-flash",
  messages: [{ role: "user", content: "Olá!" }],
  stream: true,
});
```

## 🧪 Testes

```bash
deno task test
```

## 🛠 Desenvolvimento

Consulte [AGENTS.md](./AGENTS.md) para diretrizes de estilo de código e comandos de desenvolvimento.
