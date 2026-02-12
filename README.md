# Antigravity OpenAI Proxy

Um proxy leve e eficiente para converter requisições no formato **OpenAI API** para a API interna do **Antigravity** (Google Cloud Code / Gemini). Este projeto permite usar modelos como Gemini 3 e Claude através de ferramentas que suportam apenas o padrão OpenAI.

## 🌟 Principais Funcionalidades

- **Compatibilidade OpenAI:** Use o Antigravity como se fosse o serviço da OpenAI. Compatível com SDKs oficiais, LibreChat, Dify, TypingMind, etc.
- **Suporte Multi-usuário:** O `refresh_token` do Google é usado como `API Key`, permitindo que múltiplos usuários utilizem o proxy com suas próprias credenciais.
- **Suporte a Streaming:** Respostas em tempo real via Server-Sent Events (SSE).
- **Thinking Support:** Preserva e formata blocos de pensamento (reasoning) para modelos que suportam essa funcionalidade (Gemini 3, Claude).
- **Tool Calling:** Tradução transparente de definições de ferramentas (JSON Schema) e resultados de execução.
- **Failover Inteligente:** Tentativa automática em múltiplos endpoints da infraestrutura do Google (Daily, Autopush e Prod) para garantir alta disponibilidade.

---

## 🚀 Como Começar

### 1. Pré-requisitos
- [Deno](https://deno.com/) instalado em sua máquina.

### 2. Obter o Google Refresh Token

O proxy utiliza um Google Refresh Token como API Key. Para obter o seu:

```bash
deno task antigravity-login
```

Siga as instruções no terminal:
1. Uma URL de autorização será exibida
2. Abra a URL no navegador e faça login com sua conta Google
3. Autorize o acesso solicitado
4. O Refresh Token será exibido no terminal

Copie o Refresh Token e use-o como API Key.

### 3. Configuração

Crie um arquivo `.env` baseado no `.env.example`:
```env
PORT=8000
KEEP_THINKING=false
```

### 4. Rodando o Servidor
```bash
# Desenvolvimento (com auto-reload)
deno task dev

# Produção
deno task start
```

---

## 🔌 Conectividade & Uso

| Parâmetro | Valor | Descrição |
| :--- | :--- | :--- |
| **Base URL** | `http://localhost:8000/v1` | Endpoint para ferramentas compatíveis com OpenAI |
| **API Key** | `Bearer <REFRESH_TOKEN>` | Use seu Google Refresh Token como chave |

### Exemplo de Uso (SDK OpenAI)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "1//0abc...seu-refresh-token-aqui"
});

const response = await client.chat.completions.create({
  model: "gemini-3-flash",
  messages: [{ role: "user", content: "Olá!" }],
  stream: true,
});
```

---

## 🤖 Modelos Suportados

O proxy mapeia automaticamente os modelos para os endpoints corretos do Antigravity:

- `gemini-3-flash`
- `gemini-3-pro`
- `claude-sonnet-4-5`
- `claude-opus-4-5`

### Controlando o Nível de Raciocínio (`reasoning_effort`)

O proxy suporta o parâmetro `reasoning_effort` do OpenAI para controlar a intensidade do raciocínio em modelos thinking:

**Valores suportados:** `low`, `medium`, `high`, `minimal` (Gemini 3 Flash apenas)

**Exemplo:**
```typescript
const response = await client.chat.completions.create({
  model: "gemini-3-pro",
  messages: [{ role: "user", content: "Explique a relatividade" }],
  reasoning_effort: "high"  // Usa gemini-3-pro-high
});
```

**Mapeamento por modelo:**

| Modelo | `low` | `medium` | `high` | `minimal` | Default |
|--------|-------|----------|--------|-----------|---------|
| **Gemini 3 Pro** | `-low` | `-low` | `-high` | `-low` | `-low` |
| **Gemini 3 Flash** | `thinkingLevel: low` | `thinkingLevel: medium` | `thinkingLevel: high` | `thinkingLevel: minimal` | `thinkingLevel: medium` |
| **Claude Sonnet 4-5** | 8K tokens | 16K tokens | 32K tokens | 8K tokens | 16K tokens |
| **Claude Opus 4-5** | 8K tokens | 16K tokens | 32K tokens | 8K tokens | 16K tokens |

---

## 🧪 Testes Automatizados

Garantimos a estabilidade do proxy através de uma suíte de testes completa:

1. **Testes de Unidade:** Valida a conversão de formatos e limpeza de schemas.
2. **Testes de Integração:** Simula chamadas reais e valida o fluxo de streaming.
3. **Testes de Contrato:** Garante que o SDK oficial da OpenAI consegue consumir o proxy sem erros.

```bash
deno task test
```

---

## 🛠️ Desenvolvimento

Este projeto é construído com **Deno** e **Hono**, focado em performance e zero dependências externas pesadas.

Para diretrizes de contribuição, padrões de código e comandos detalhados, consulte o arquivo [AGENTS.md](./AGENTS.md).

### Docker (Opcional)
```bash
docker build -t antigravity-proxy .
docker run -p 8000:8000 --env-file .env antigravity-proxy
```
