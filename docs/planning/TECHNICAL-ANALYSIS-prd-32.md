# Análise Técnica Detalhada — PRD 32: Marketing Artifact Generation Tools

**Data:** 2026-03-15
**Contexto:** Preparação para Phase 1 (Setup e Infraestrutura)

---

## 1. Análise de Dependências Externas

### 1.1 Nanobanana (Image Generation)

**Status:** API Ativa (produção)
**Endpoint Base:** `https://api.nanobanana.ai/v1`

**Modelo de Preço:**
- Tipicamente: $0.01-0.05 por imagem (1024x1024)
- Varações gratuitas ou muito baratas
- Rate limit: ~60 req/min (verificar com docs)

**Capacidades Necessárias:**
- ✅ Geração de imagem com prompt
- ✅ Controle de style (photorealistic, illustration, etc)
- ✅ Controle de resolução
- ✅ Controle de seed (para reproducibilidade)
- ✅ Múltiplos formatos (PNG, JPG, WebP)

**Riscos Identificados:**
- API pode estar instável em períodos de pico
- Prompt validation pode ser restritivo
- Latência: ~15-30s por imagem típica

**Mitigação:**
- Implementar circuit breaker (3 falhas → fallback)
- Cache agressivo (24h para prompts idênticos)
- Retry com exponential backoff

### 1.2 Vimeo (Video Hosting)

**Status:** API Estável (produção)
**Base URL:** `https://api.vimeo.com`

**Autenticação:** OAuth 2.0 ou Access Token
**Quotas:** Depende do plano (Pro, Business, etc)

**Capacidades Necessárias:**
- ✅ Upload de vídeo (chunked)
- ✅ Atualização de metadados
- ✅ Transcode para múltiplos formatos
- ✅ Controle de visibilidade (private, internal, public)
- ✅ Geração de thumbnails
- ✅ Polling de status de upload/transcode

**Riscos Identificados:**
- Transcodificação pode levar 10-30 min (async)
- Quotas de armazenamento por conta
- Limite de simultaneidade de uploads

**Mitigação:**
- Implementar fila de uploads (max 3 paralelos)
- Polling com backoff exponencial (5s → 60s)
- Webhook notification quando pronto (future)
- Monitorar storage usage

### 1.3 Text-to-Speech (TTS)

**Opções Avaliadas:**

#### ElevenLabs
- **Modelo de Preço:** $0.30 por 1M caracteres
- **Latência:** ~3-8s para 500 caracteres
- **Vozes:** 30+ (natural, múltiplas línguas)
- **Qualidade:** Muito alta, muito natural
- **Recomendação:** ⭐⭐⭐⭐⭐ (preferida)

#### Google Cloud Text-to-Speech
- **Preço:** $0.004 por 1M caracteres
- **Latência:** ~5-10s para 500 caracteres
- **Vozes:** 200+ (WaveNet)
- **Qualidade:** Alta
- **Recomendação:** ⭐⭐⭐⭐ (boa alternativa)

#### AWS Polly
- **Preço:** $0.004 por 1M caracteres
- **Latência:** ~5-10s
- **Vozes:** 150+ (Neural)
- **Qualidade:** Alta
- **Recomendação:** ⭐⭐⭐⭐ (boa alternativa)

**Decisão Recomendada:** ElevenLabs (melhor qualidade + vozes naturais)

**Implementação:**
- Configurável via ENV (provider = 'elevenlabs' | 'google' | 'aws')
- Cache agressivo: 7 dias para TTS idêntico
- Suporte multi-voice: sintetizar com 3-5 vozes diferentes

### 1.4 Speech-to-Text (STT)

**Opções Avaliadas:**

#### OpenAI Whisper API
- **Preço:** $0.02 por minuto de áudio
- **Latência:** ~5-30s depende do provider (cloud vs local)
- **Accuracy:** ~95-99% para English, ~90%+ para português
- **Formato:** MP3, WAV, OGG, M4A
- **Recomendação:** ⭐⭐⭐⭐⭐ (excelente, preferida)

#### Google Cloud Speech-to-Text
- **Preço:** $0.006 por 15s
- **Latência:** ~5-20s
- **Accuracy:** ~96-98%
- **Recomendação:** ⭐⭐⭐⭐ (boa alternativa)

#### AWS Transcribe
- **Preço:** $0.0001 por segundo
- **Latência:** ~5-20s
- **Accuracy:** ~95%+
- **Recomendação:** ⭐⭐⭐⭐ (mais barato)

**Decisão Recomendada:** OpenAI Whisper (melhor accuracy, bom preço)

---

## 2. Análise de Arquitetura

### 2.1 Componentes Principais

```
┌─────────────────────────────────────────────────────────┐
│ Marketing Artifact Module                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────┐  ┌────────────────────┐          │
│  │ Agent Tools API  │  │ Provider Registry  │          │
│  └────────┬─────────┘  └────────┬───────────┘          │
│           │                     │                      │
│  ┌────────▼─────────────────────▼────────┐            │
│  │ Artifact Manager (Orchestrator)       │            │
│  └────────┬──────────────────────────────┘            │
│           │                                           │
│  ┌────────▼─────────────────────────────┐            │
│  │ Providers (Image, Video, TTS, STT)   │            │
│  └────────┬──────────────────────────────┘            │
│           │                                           │
│  ┌────────▼──────────┬──────────┬──────────┐         │
│  │ Nanobanana │ Vimeo │ TTS │ STT        │         │
│  └───────────┴──────────┴──────────┴──────────┘         │
│                                                         │
│  ┌─────────────────────────────────────┐              │
│  │ Storage Layer (DB)                  │              │
│  ├─────────────────────────────────────┤              │
│  │ - Artifacts                         │              │
│  │ - Similarity Cache                  │              │
│  │ - Cost Log                          │              │
│  └─────────────────────────────────────┘              │
│                                                         │
│  ┌─────────────────────────────────────┐              │
│  │ Services                            │              │
│  ├─────────────────────────────────────┤              │
│  │ - Job Queue (async)                 │              │
│  │ - Cache Layer (in-memory/Redis)    │              │
│  │ - Error Handling (circuit breaker) │              │
│  └─────────────────────────────────────┘              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Fluxo de Dados (Geração de Imagem)

```
Agent Call: tools.generateImage("A cat...")
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Validar Prompt                  │ ← Verificar conteúdo proibido
│    - Length check                  │ ← 2000 char max
│    - Content filter                │ ← Regex simples
└─────────────┬───────────────────────┘
              │
         ✓ Pass
              │
              ▼
┌─────────────────────────────────────┐
│ 2. Verificar Similarity Cache       │ ← SHA-256 hash do prompt
│    - Calculate content hash         │ ← Se <24h, reutilizar
│    - Lookup em BD                   │
└─────────────┬───────────────────────┘
              │
         Cache Hit?
        /      \
      YES      NO
      │        │
      │        ▼
      │   ┌────────────────────────────┐
      │   │ 3. Chamar Nanobanana API   │ ← HTTP POST request
      │   │    - Send prompt + params  │ ← Timeout: 40s
      │   │    - Retry logic           │ ← 3 tentativas
      │   └────────────┬───────────────┘
      │                │
      │                ▼
      │   ┌────────────────────────────┐
      │   │ 4. Obter URL de imagem     │ ← Armazenar temporariamente
      │   │    - Download metadata     │
      │   └────────────┬───────────────┘
      │                │
      └────────┬───────┘
               │
               ▼
        ┌──────────────────────────────┐
        │ 5. Salvar em BD              │
        │    - Create Artifact record  │
        │    - Update cache entry      │
        │    - Log cost (Nanobanana)   │
        └──────────────┬───────────────┘
                       │
                       ▼
                ┌──────────────────────┐
                │ 6. Retornar para      │
                │    agent: {           │
                │      id, url,         │
                │      prompt, ...      │
                │    }                  │
                └──────────────────────┘
```

### 2.3 Padrão de Cache

**Strategy:** Similarity Cache com TTL

```typescript
// Geração de Imagem
ContentHash = SHA-256(prompt)
TTL = 24 horas

// TTS
ContentHash = SHA-256(text + voice + lang + speed)
TTL = 7 dias

// Lookup:
- If ContentHash found && not expired && same provider
  → Reutilizar artifact (cache HIT)

- Else
  → Gerar novo (cache MISS)
```

**Benefícios:**
- Reduz custos com APIs (~20-30% economia esperada)
- Melhora latência (artefato reutilizado ~10ms vs 15-30s para gerar)
- Consistência: mesmo input → mesmo output

**Riscos:**
- Stale cache (expirado mas ainda em memória)
- Mitigação: TTL rigoroso + invalidação manual possível

---

## 3. Análise de Modelo de Dados

### 3.1 Tabela: marketing_artifacts

**Propósito:** Armazenar todos os artefatos gerados

**Cardinalidade esperada:**
- 1 agente pode gerar 10-1000 artefatos/dia
- 1000 agentes simultâneos → ~10M artefatos/mês

**Estratégia de Indexação:**
```sql
PRIMARY KEY: id (UUID)
UNIQUE: (agent_id, type, source, source_id) — prevenção de duplicatas
INDEX: (agent_id, created_at) — queries por agente + período
INDEX: (type, status) — filtros de tipo e status
INDEX: (created_at) — TTL cleanup
```

**Estimativa de Tamanho:**
- Média por registro: ~500 bytes (incluindo URLs, metadata)
- 10M registros → ~5GB (com índices: ~7-8GB)
- Retenção: 90 dias + archive → política de cleanup

### 3.2 Tabela: artifact_similarity_cache

**Propósito:** Detectar prompts/textos similares para reutilização

**Cardinalidade esperada:**
- 1 artifact → 1 cache entry
- Mesmo tamanho aproximado de marketing_artifacts
- TTL: 24h (imagens), 7d (TTS)
- Cleanup automático de expirados

**Estratégia:**
```sql
PRIMARY KEY: id
UNIQUE: (content_hash, source) — prevenção de duplicatas
INDEX: (expires_at) — para cleanup batch
FK: artifact_id → marketing_artifacts
FK: matched_artifact_id → marketing_artifacts
```

### 3.3 Tabela: artifact_cost_log

**Propósito:** Auditoria de custos com provedores

**Cardinalidade esperada:**
- 1 artefato gerado → 1-2 cost log entries
- 10M artefatos → ~10-20M cost entries
- Retenção: 12 meses (compliance)

**Estratégia:**
```sql
PRIMARY KEY: id
INDEX: (agent_id, created_at) — relatórios por agente
INDEX: (provider, created_at) — custos por provider
FK: agent_id → agents (future)
FK: artifact_id → marketing_artifacts (nullable, para ops não associadas)
```

---

## 4. Análise de Performance

### 4.1 Bottlenecks Identificados

| Operação | Latência Esperada | Gargalo | Mitigação |
|----------|------------------|---------|-----------|
| generateImage | 15-30s | API Nanobanana | Cache, async queue |
| uploadVideo | 2-10min | Network I/O + transcode | Chunked upload, async |
| synthesizeSpeech | 3-10s | API TTS | Cache (7d) |
| transcribeAudio | 2-3x duration | API STT | Async fila |
| Similarity lookup | 50-100ms | DB query | In-memory cache + índices |

### 4.2 Cenário de Load Testing

**Cenário:** 100 agentes, 10 req/agente/min

```
Total throughput: 1000 req/min

Distribuição:
- generateImage: 40% → 400/min → 6.7/sec
  Latência agregada: 6.7/sec × 20s avg = ~134s wall time
  Solução: Queue com 5 workers paralelos → 26s wall time ✅

- uploadVideo: 10% → 100/min → 1.7/sec
  Latência agregada: 1.7/sec × 300s avg = ~510s wall time
  Solução: Queue com 3 workers paralelos + chunked → reasonable ✅

- synthesizeSpeech: 40% → 400/min → 6.7/sec
  Latência agregada: com cache 20% hit = 5.3/sec × 3s = ~16s wall time
  Solução: Queue com 3 workers paralelos ✅

- transcribeAudio: 10% → 100/min → 1.7/sec
  Latência agregada: 1.7/sec × 20s avg = ~34s wall time
  Solução: Queue com 2 workers paralelos ✅
```

**Conclusão:** Com job queue + parallelização adequada, sistema suporta 1000 req/min

### 4.3 Otimizações Propostas

1. **In-Memory Cache:**
   - Cache de recently used artifacts em memória (Redis se disponível)
   - TTL: 1 hora
   - Tamanho max: 10k entries (~50MB)

2. **Database Optimization:**
   - Índices compostos para queries frequentes
   - Particionamento por data (se >1B registros)
   - Query caching com ttl

3. **Provider-Level:**
   - Connection pooling para HTTP requests
   - Pipelining se suportado
   - Batch requests onde possível

---

## 5. Análise de Segurança

### 5.1 Threat Model

| Ameaça | Severidade | Controle |
|--------|-----------|----------|
| Credenciais comprometidas | CRÍTICO | Criptografia AES-256-GCM, ENV only |
| Prompt injection | ALTO | Validação + sanitização |
| Geração de conteúdo NSFW | ALTO | Content filter inicial + moderação AI (future) |
| Cost abuse (agente gera demais) | MÉDIO | Rate limiting + quotas |
| Artefatos privados expostos | MÉDIO | Autenticação em URLs + 署名 URLs |
| DDoS em upload de vídeo | BAIXO | Rate limiting + CAPTCHA (future) |

### 5.2 Implementação de Segurança

**Criptografia de Credenciais:**
```typescript
// Reutilizar infrastructure de PRD-02
const encrypted = encryptSecret(apiKey);
// Armazenar encrypted em provider_credentials table
// Descriptografar apenas em tempo de uso

// Masked logging:
logger.info(`Provider: ${provider}, Key: ${apiKey.slice(0, 8)}...`);
```

**Validação de Prompt:**
```typescript
const forbiddenPatterns = [
  /violence/i,
  /hate/i,
  /explicit/i,
  // ... mais patterns
];

function validatePrompt(prompt: string): boolean {
  return !forbiddenPatterns.some(p => p.test(prompt));
}
```

**Rate Limiting:**
```typescript
// Per agent, per operation
const rateLimiter = new RateLimiter({
  generateImage: 10/min,      // 10 imagens/min por agente
  uploadVideo: 5/min,
  synthesizeSpeech: 20/min,
  transcribeAudio: 10/min,
});
```

---

## 6. Análise de Custo Operacional

### 6.1 Estimativa de Custo Mensal

**Cenário:** 100 agentes, média 50 artefatos/agente/mês = 5000 artefatos/mês

```
Provider: Nanobanana (image generation)
- 2000 imagens/mês × $0.02 = $40

Provider: Vimeo (video hosting)
- 100 vídeos/mês (avg 50MB)
- Storage: 5GB total × $0.08/GB/mês = $0.40
- Bandwidth: ~500GB/mês × $0.25/GB = $125
- Transcode: $10-20
Total: ~$135

Provider: ElevenLabs (TTS)
- 2000 TTS/mês × 100 chars avg = 200k chars
- 200k chars × $0.30/1M = $0.06

Provider: OpenAI Whisper (STT)
- 100 STT/mês × 300s avg = 50k seconds
- 50k sec × $0.02/min = ~$17

Database Storage:
- 5000 artifacts × 500 bytes = 2.5MB/mês
- 12 months × 2.5MB = 30MB (negligible)

Total Monthly Cost: ~$192
Cost per artifact: ~$0.04
```

**Recomendações:**
- Implementar cost tracking por agente
- Alertar se ultrapassar $100/mês por agente
- Implementar soft quota (warn) + hard quota (block)

---

## 7. Decisões de Implementação

### 7.1 Tecnologia: Job Queue

**Opções Avaliadas:**

| Technology | Pros | Cons | Recomendação |
|-----------|------|------|--------------|
| Bull (Redis) | Simples, confiável, persistido | Redis dependency | ⭐⭐⭐⭐⭐ |
| Bee-Queue | Leve, rápido | Menos features | ⭐⭐⭐⭐ |
| RabbitMQ | Robusto, distribuído | Complexo, excessivo | ⭐⭐⭐ |
| Custom + DB | Nenhuma dependency externa | Mais código, menos confiável | ⭐⭐ |

**Decisão:** Bull + Redis (se Redis disponível, senão custom com DB)

### 7.2 Tecnologia: Cache

**In-Memory:** Node.js built-in Map com TTL
**Distributed:** Redis (if available)
**Pattern:** LRU (Least Recently Used) eviction

### 7.3 Versionamento de API

**Padrão:** Semver com breaking changes em major versions

```typescript
// V1.0: Current implementation
tools.generateImage(prompt, options): Promise<Artifact>

// Future V2.0 (breaking change):
tools.generateImage(params: { prompt, style, ... }): Promise<ArtifactV2>
```

---

## 8. Plano de Testes

### 8.1 Unit Tests

```
providers/
├─ image/
│  └─ nanobanana.spec.ts (20 testes)
├─ video/
│  └─ vimeo.spec.ts (20 testes)
├─ tts/
│  └─ elevenlabs.spec.ts (20 testes)
└─ stt/
   └─ whisper.spec.ts (20 testes)

storage/
├─ artifact-manager.spec.ts (30 testes)
└─ cache.spec.ts (15 testes)

Total: ~125 testes unitários
Coverage target: >85%
```

### 8.2 Integration Tests

```
/integration
├─ artifact-generation.spec.ts (10 testes)
├─ artifact-retrieval.spec.ts (8 testes)
├─ cost-tracking.spec.ts (6 testes)
├─ cache-similarity.spec.ts (8 testes)
└─ error-handling.spec.ts (8 testes)

Total: ~40 testes de integração
```

### 8.3 Load Tests

```
Cenários:
1. 100 generateImage req/sec (5 min)
2. 50 uploadVideo + 50 transcribeAudio paralelos (10 min)
3. Cache hit rate under 1000 concurrent agents
4. Memory leak detection (1 hour sustained)

Tools: k6 ou Artillery
```

---

## 9. Dependências de Implementação

### 9.1 Dependências Internas
- ✅ Drizzle ORM (já em uso para PR-02)
- ✅ crypto (Node.js nativo)
- ✅ Provider credential infrastructure (PRD-02)

### 9.2 Dependências Externas (A Instalar)

```json
{
  "dependencies": {
    "bull": "^4.10.0",        // Job queue
    "redis": "^4.6.0",        // Opcional, para distributed cache
    "node-fetch": "^3.3.0",   // HTTP client (se não tiver)
    "zod": "^3.21.0"          // Já existe, validation
  },
  "devDependencies": {
    "k6": "latest",           // Load testing
    "@testing-library/node": "latest"
  }
}
```

### 9.3 Variáveis de Ambiente Necessárias

```bash
# Nanobanana
NANOBANANA_API_KEY=...
NANOBANANA_API_BASE=https://api.nanobanana.ai/v1

# Vimeo
VIMEO_ACCESS_TOKEN=...
VIMEO_API_BASE=https://api.vimeo.com

# TTS (ElevenLabs)
ELEVENLABS_API_KEY=...
ELEVENLABS_MODEL_ID=eleven_monolingual_v1

# STT (OpenAI Whisper)
OPENAI_API_KEY=...

# Encryption (compartilhado com PRD-02)
PROVIDER_CREDENTIALS_KEY=<base64-256bit-key>

# Redis (se usar)
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=file:./data/dev.db
```

---

## 10. Checklist de Revisão Arquitetural

- [ ] Schema Drizzle aprovado
- [ ] Padrão de provider validado
- [ ] Job queue technology decidido
- [ ] Provedores (Nanobanana, Vimeo, TTS, STT) confirmados
- [ ] Modelo de preço entendido para cada provider
- [ ] Plano de segurança revisado
- [ ] Performance targets acordados
- [ ] Plano de testes aproved
- [ ] Documentação iniciada

---

**Preparado por:** Análise Técnica Detalhada
**Data:** 2026-03-15
**Próxima Etapa:** Apresentar para Architectural Review
