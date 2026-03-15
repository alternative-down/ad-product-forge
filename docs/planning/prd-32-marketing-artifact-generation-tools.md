# PRD 32: Marketing Artifact Generation Tools

**Status:** Draft - Detailed Analysis and Planning
**Data:** 2026-03-15
**Versão:** 1.0
**Responsável:** Marketing Automation & Content Generation Team

---

## Resumo Executivo

### Objetivo Principal
Fornecer um conjunto integrado de ferramentas que permitam agentes criarem, gerenciarem e fazerem deploy de artefatos de marketing (imagens, vídeos, animações e conteúdo de áudio) de forma programática, utilizando integrações com serviços especializados (Nanobanana para imagens, Vimeo para vídeos) e capacidades de Text-to-Speech (TTS) e Speech-to-Text (STT).

### Proposta de Valor
1. **Automação Completa:** Agentes podem gerar materiais de marketing sem intervenção manual
2. **Qualidade Profissional:** Integração com ferramentas especializadas (Nanobanana, Vimeo) garante qualidade de saída
3. **Versatilidade de Mídia:** Suporte para múltiplos tipos de artefatos (imagens estáticas, animações, vídeos, áudio)
4. **Escalabilidade:** Gerar centenas de variações de materiais para diferentes canais/públicos
5. **Integração Workflow:** Resultados podem ser incorporados automaticamente em campanhas e distribuição

### Escopo da Feature
- Integração com Nanobanana API para geração de imagens com AI/criativo
- Integração com Vimeo API para hospedagem, manipulação e metadados de vídeos
- Implementação de Text-to-Speech (TTS) para geração de narração/áudio
- Implementação de Speech-to-Text (STT) para transcrição de áudio
- Abstraçao de ferramentas em agent-facing tools
- Suporte para templates e variações de artefatos
- Gerenciamento de credenciais de terceiros
- Auditoria de artefatos gerados
- Cache e reutilização de artefatos similares

### Não está no Escopo
- Edição manual/UI de artefatos (apenas programática via API)
- Geração de vídeos do zero (apenas manipulação/hosting via Vimeo)
- Reconhecimento facial ou análise biométrica em vídeos
- Integração com redes sociais para publicação direta (responsabilidade de outra feature)
- Moderação de conteúdo baseada em AI (apenas logging)
- Streaming em tempo real (foco em assets estáticos/on-demand)

---

## 2. Contexto Técnico Atual

### Arquitetura Existente

#### Estrutura de Agentes e Ferramentas
```
Runtime (createForgeAgent)
  ├─ Agent Instance
  │  ├─ Communication Module (email, Discord, Slack, etc)
  │  ├─ Research Workflow (web search, data gathering)
  │  ├─ Tool Registry
  │  │  ├─ Native tools (createTask, sendMessage, etc)
  │  │  └─ Custom tools (provider-specific)
  │  └─ Execution Engine
  │
  └─ [Proposed] Marketing Artifact Module
     ├─ Image Generation (Nanobanana)
     ├─ Video Management (Vimeo)
     ├─ Audio Synthesis (TTS)
     ├─ Audio Transcription (STT)
     ├─ Artifact Storage/Registry
     └─ Cache Layer
```

#### Problema Identificado
1. **Sem integração com ferramentas criativas:** Agentes não conseguem gerar/manipular materiais visuais/áudio
2. **Sem capacidade de TTS/STT:** Conteúdo apenas textual, sem suporte a áudio
3. **Sem gerenciamento centralizado:** Credenciais de terceiros dispersas ou hardcoded
4. **Sem auditoria:** Impossível rastrear quais agentes geraram quais artefatos
5. **Sem otimização:** Cada geração é independente, sem reutilização de artefatos similares

### Stack Técnico Atual
- **Runtime:** Node.js + TypeScript
- **Agent Framework:** Mastra (custom)
- **Tool System:** Native + provider-based tools
- **Database:** LibSQL (SQLite-compatible)
- **Criptografia:** crypto (Node.js native)
- **HTTP Client:** Node.js fetch ou similiar

### Dependências Existentes
- `@libsql/client` — Database
- `zod` — Schema validation
- `crypto` — Encryption
- `node-fetch` ou `axios` — HTTP requests

### Integrações Candidatas (Terceiros)
- **Nanobanana:** Image generation API (AI + criativo)
- **Vimeo:** Video hosting, manipulation, metadata management
- **Web Speech API / ElevenLabs / Google Cloud TTS:** Text-to-Speech
- **Web Speech API / Google Cloud STT / Whisper:** Speech-to-Text

---

## 3. Requisitos Funcionais

### 3.1 Geração e Manipulação de Imagens

**RF-1: Integração com Nanobanana**
- Criar artefato: `generateImage(prompt, style, resolution, format)`
- Parâmetros suportados:
  - `prompt` (string): Descrição do que gerar
  - `style` (enum): 'photorealistic', 'illustration', 'cartoon', 'abstract', 'commercial'
  - `resolution` (enum): '512x512', '768x768', '1024x1024', 'custom (WxH)'
  - `format` (enum): 'png', 'jpg', 'webp'
  - `seed` (number): Controlar reproducibilidade (opcional)
- Retorno: URL da imagem, metadata (resolução, tamanho, gerado_em)
- Tratamento de erros: Rate limiting, timeout, invalid prompt

**RF-2: Reutilização e Cache de Imagens**
- Detectar prompts similares (fuzzy match)
- Armazenar hash (SHA-256) de imagens geradas
- Reutilizar artefato se gerado em últimas 24h
- Log de cache hit/miss para otimização

**RF-3: Variações de Imagem**
- Gerar múltiplas variações com mesmo prompt base
- Parâmetro `variationCount` (1-10)
- Aplicar seed incremental ou aleatório para cada
- Retornar array de URLs

### 3.2 Hospedagem e Manipulação de Vídeos

**RF-4: Integração com Vimeo**
- Upload de vídeo: `uploadVideo(file, metadata, visibility)`
- Parâmetros:
  - `file` (Buffer ou stream): Conteúdo do vídeo
  - `metadata`: { title, description, tags, duration }
  - `visibility` (enum): 'private', 'internal', 'public'
- Retorno: Vimeo video ID, player URL, CDN URL
- Tratamento: Validação de formato, tamanho máximo, timeout de upload

**RF-5: Manipulação de Metadados em Vimeo**
- Atualizar título, descrição, tags de vídeo existente
- Adicionar/remover vídeo de pasta ou coleção
- Gerar variações de título/descrição (múltiplas linguas, formatos)
- Controlar acesso (permissões de view/download/share)

**RF-6: Geração de Thumbnails e Previews**
- Extrair frame em tempo específico como thumbnail
- Gerar previews estáticos para UI (se aplicável)
- Armazenar referência local (cache) com TTL

**RF-7: Transcodificação e Formatos**
- Solicitar Vimeo fazer transcode para múltiplos formatos (MP4, WebM, HLS)
- Suportar diferentes resoluções (1080p, 720p, 480p)
- Polling de status até conclusão

### 3.3 Text-to-Speech (TTS)

**RF-8: Síntese de Áudio**
- Ferramenta: `synthesizeSpeech(text, voice, language, speed, format)`
- Parâmetros:
  - `text` (string): Conteúdo a sintetizar (até 5000 caracteres)
  - `voice` (enum): 'male-neutral', 'female-neutral', 'male-professional', 'female-professional' [provider-specific]
  - `language` (enum): 'en-US', 'pt-BR', 'es-ES', 'fr-FR' (provider dependent)
  - `speed` (number): 0.5 — 2.0 (padrão 1.0)
  - `format` (enum): 'mp3', 'wav', 'ogg'
- Retorno: URL do arquivo de áudio, duração, tamanho
- Provider: ElevenLabs, Google Cloud TTS ou AWS Polly (configurável via ENV)

**RF-9: Caching de TTS**
- Detectar texto idêntico já sintetizado
- Reutilizar se mesma voz, língua, speed
- Armazenar hash (SHA-256) com duração da cache (7 dias)

**RF-10: Múltiplas Vozes**
- Gerar mesma narração em múltiplas vozes
- Parâmetro: `voices: ['male-neutral', 'female-professional']`
- Retornar array de { voice, url, duration }

### 3.4 Speech-to-Text (STT)

**RF-11: Transcrição de Áudio**
- Ferramenta: `transcribeAudio(audioUrl or audioBuffer, language, provider)`
- Parâmetros:
  - `audio` (URL ou Buffer): Arquivo de áudio
  - `language` (enum): 'en-US', 'pt-BR', etc
  - `provider` (enum): 'google', 'openai-whisper', 'aws' (configurável)
  - `returnTimestamps` (boolean): Incluir timestamps por palavra
- Retorno: Texto transcrito, confiança por palavra, duração de processamento
- Suportar: MP3, WAV, OGG, M4A

**RF-12: Transcrição em Lote**
- Processar múltiplos arquivos de áudio
- Parâmetro: `transcribeAudioBatch(audioUrls[], language)`
- Parallelização com limite de concorrência

### 3.5 Artefatos: Abstração e Gerenciamento

**RF-13: Modelo de Dados de Artefato**
```typescript
type Artifact = {
  id: string;                    // UUID gerado pela plataforma
  agentId: string;               // Qual agente criou
  type: 'image' | 'video' | 'audio' | 'animation';
  source: 'nanobanana' | 'vimeo' | 'tts' | 'stt' | 'external';
  sourceId: string;              // ID externo (Nanobanana image_id, Vimeo video_id, etc)

  // Metadados
  title?: string;
  description?: string;
  tags?: string[];

  // URLs e storage
  url: string;                   // URL pública de acesso
  localPath?: string;            // Path local se cacheado
  cdnUrl?: string;               // CDN URL se disponível

  // Conteúdo original (para referência)
  prompt?: string;               // Para imagens/animações geradas
  inputText?: string;            // Para TTS
  inputAudioUrl?: string;        // Para STT

  // Metadata técnica
  mimeType: string;              // image/png, video/mp4, audio/mp3
  fileSize: number;              // Em bytes
  duration?: number;             // Para vídeo/áudio, em segundos
  resolution?: string;           // "1024x1024" para imagens, "1920x1080" para vídeos

  // Rastreamento
  createdAt: Date;
  expiresAt?: Date;              // Se temporário
  version: number;               // Para atualizações
  status: 'pending' | 'completed' | 'failed' | 'archived';

  // Custo (se houver)
  cost?: {
    provider: string;
    amount: number;
    currency: string;
    timestamp: Date;
  };
};
```

**RF-14: Registro de Artefatos em Banco de Dados**
- Tabela: `marketing_artifacts`
- Armazenar todos os artefatos gerados com auditoria
- Índices: agentId, type, source, createdAt
- Dados sensíveis (prompts, textos) podem ser criptografados

**RF-15: API de Consulta de Artefatos**
- Listar artefatos por agente, tipo, fonte
- Filtrar por data, status
- Buscar por conteúdo (prompt, descrição)
- Paginação suportada

### 3.6 Credenciais de Terceiros

**RF-16: Gerenciamento de Credenciais**
- Armazenar API keys de Nanobanana, Vimeo, TTS provider
- Criptografar em banco de dados (reutilizar infrastructure de RF-02 Communication Provider)
- Suportar múltiplas credenciais por provider (fallback)
- Rotação de chaves sem downtime

**RF-17: Per-Agent API Quota**
- Limitar chamadas por agente (se necessário)
- Rastrear uso em `artifact_cost_log`
- Alertar quando atingir threshold

### 3.7 Agent-Facing Tools

**RF-18: Tools Disponíveis ao Agente**
```typescript
// Imagem
tools.generateImage(prompt: string, options?: ImageOptions): Promise<ArtifactResult>
tools.generateImageVariations(prompt: string, count: number): Promise<ArtifactResult[]>

// Vídeo
tools.uploadVideo(fileBuffer: Buffer, metadata: VideoMetadata): Promise<ArtifactResult>
tools.updateVideoMetadata(videoId: string, metadata: VideoMetadata): Promise<void>
tools.getVideoPlayer(videoId: string): Promise<{ playerUrl, embedCode }>

// Áudio (síntese)
tools.synthesizeSpeech(text: string, options?: TTSOptions): Promise<ArtifactResult>
tools.synthesizeMultipleVoices(text: string, voices: string[]): Promise<ArtifactResult[]>

// Áudio (transcrição)
tools.transcribeAudio(audioUrl: string, language?: string): Promise<TranscriptionResult>
tools.transcribeAudioBatch(audioUrls: string[]): Promise<TranscriptionResult[]>

// Consulta
tools.listArtifacts(filters?: ArtifactFilters): Promise<Artifact[]>
tools.getArtifact(artifactId: string): Promise<Artifact>
tools.deleteArtifact(artifactId: string): Promise<void>
```

---

## 4. Requisitos Não-Funcionais

### 4.1 Performance
- **RNF-1:** Geração de imagem < 30 segundos (end-to-end com Nanobanana)
- **RNF-2:** Upload de vídeo < 5 minutos (depende tamanho arquivo)
- **RNF-3:** TTS < 10 segundos (para até 500 caracteres)
- **RNF-4:** STT < 2x duração do áudio (com fila de processamento)
- **RNF-5:** Lookup de artefato < 50ms (com índices)
- **RNF-6:** Cache de TTS/imagens similar: match em < 100ms

### 4.2 Confiabilidade
- **RNF-7:** Retry automático em falha de API (exponential backoff)
- **RNF-8:** Fallback para provedores alternativos (se múltiplos configurados)
- **RNF-9:** Compensação de transações parciais (ex: imagem gerada mas falhou ao salvar metadados)
- **RNF-10:** Circuit breaker para serviços degradados

### 4.3 Segurança
- **RNF-11:** Credenciais de terceiros criptografadas em repouso
- **RNF-12:** Validação de conteúdo (prompts, imagens) contra abuse
- **RNF-13:** Rate limiting por agente/API key (evitar DoS)
- **RNF-14:** Logging seguro (nunca logar credenciais, apenas hash)
- **RNF-15:** URLs de artefatos privados requerem autenticação

### 4.4 Escalabilidade
- **RNF-16:** Suportar 1000+ agentes gerando simultaneamente
- **RNF-17:** Suportar 10 000+ artefatos por agente
- **RNF-18:** Fila assíncrona para processamento long-running (TTS, transcodificação)
- **RNF-19:** Cache distribuído para reutilização de artefatos (Redis se disponível)

### 4.5 Auditoria e Conformidade
- **RNF-20:** Rastrear: quem (agentId), o quê (tipo artefato), quando, resultado
- **RNF-21:** Manter histórico por 90 dias (com opção de archive)
- **RNF-22:** Permitir soft-delete de artefatos (não remover de BD)
- **RNF-23:** Exportar relatório de uso (artifacts por agente, por tipo)

### 4.6 Integração com Existentes
- **RNF-24:** Não quebrar existentes agent-facing tools
- **RNF-25:** Compatível com workflow de research + comunicação
- **RNF-26:** Suportar passagem de artefatos para tools de distribuição/publication

---

## 5. Arquitetura da Solução

### 5.1 Estrutura de Diretórios

```
packages/mastra-engine/
├─ src/
│  ├─ agent/
│  │  ├─ marketing-artifacts/
│  │  │  ├─ index.ts                    # Exports principais
│  │  │  ├─ models.ts                   # Types (Artifact, etc)
│  │  │  ├─ tools.ts                    # Agent-facing tools
│  │  │  ├─ providers/
│  │  │  │  ├─ image/
│  │  │  │  │  ├─ nanobanana.ts         # Provider Nanobanana
│  │  │  │  │  └─ types.ts             # ImageProvider interface
│  │  │  │  ├─ video/
│  │  │  │  │  ├─ vimeo.ts             # Provider Vimeo
│  │  │  │  │  └─ types.ts
│  │  │  │  ├─ tts/
│  │  │  │  │  ├─ elevenlabs.ts        # Provider ElevenLabs
│  │  │  │  │  ├─ google-cloud.ts      # Provider Google Cloud TTS
│  │  │  │  │  └─ types.ts
│  │  │  │  └─ stt/
│  │  │  │     ├─ openai-whisper.ts    # Provider OpenAI Whisper
│  │  │  │     ├─ google-cloud.ts      # Provider Google Cloud STT
│  │  │  │     └─ types.ts
│  │  │  ├─ storage/
│  │  │  │  ├─ artifact-store.ts       # BD access layer
│  │  │  │  └─ cache.ts                # In-memory + Redis cache
│  │  │  ├─ queue/
│  │  │  │  ├─ job-queue.ts            # Async job processing
│  │  │  │  └─ handlers.ts             # Job handlers
│  │  │  └─ utils/
│  │  │     ├─ validation.ts           # Prompt validation, etc
│  │  │     ├─ error-handling.ts       # Custom error types
│  │  │     └─ similarity.ts           # Fuzzy matching para cache
│  │  └─ ...
│  ├─ db/
│  │  ├─ schema.ts                      # Drizzle schema (adicionar tabelas)
│  │  └─ migrations/
│  │     └─ xxx-marketing-artifacts.ts # Migration
│  └─ ...
└─ ...
```

### 5.2 Novas Tabelas de Banco de Dados

```sql
-- Artefatos gerados
CREATE TABLE marketing_artifacts (
  id TEXT PRIMARY KEY,                    -- UUID
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,                     -- 'image' | 'video' | 'audio'
  source TEXT NOT NULL,                   -- 'nanobanana' | 'vimeo' | 'tts' | 'stt'
  source_id TEXT NOT NULL,                -- ID externo

  -- Conteúdo e metadados
  title TEXT,
  description TEXT,
  tags TEXT,                              -- JSON array or CSV

  -- URLs
  url TEXT NOT NULL,
  local_path TEXT,
  cdn_url TEXT,

  -- Conteúdo original
  prompt TEXT,                            -- Para imagens/animations
  input_text TEXT,                        -- Para TTS (pode ser criptografado)
  input_audio_url TEXT,                   -- Para STT

  -- Técnico
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  duration INTEGER,                       -- Segundos (vídeo/áudio)
  resolution TEXT,                        -- "1024x1024" ou "1920x1080"

  -- Status
  status TEXT NOT NULL,                   -- 'pending' | 'completed' | 'failed' | 'archived'
  version INTEGER DEFAULT 1,

  -- Rastreamento
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,

  -- Custo
  cost_provider TEXT,
  cost_amount REAL,
  cost_currency TEXT DEFAULT 'USD',

  INDEX idx_agent_id (agent_id),
  INDEX idx_type (type),
  INDEX idx_source (source),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status)
);

-- Cache de similaridade (para reutilização)
CREATE TABLE artifact_similarity_cache (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  source TEXT NOT NULL,                   -- 'nanobanana', 'tts', etc
  content_hash TEXT NOT NULL,             -- SHA-256 do prompt/texto
  similarity_score REAL,
  matched_artifact_id TEXT,               -- ID do artefato reutilizado

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,                   -- TTL (24h para imagens, 7d para TTS)

  FOREIGN KEY (artifact_id) REFERENCES marketing_artifacts(id),
  FOREIGN KEY (matched_artifact_id) REFERENCES marketing_artifacts(id),
  UNIQUE (content_hash, source),
  INDEX idx_expires_at (expires_at)
);

-- Auditoria de uso e custos
CREATE TABLE artifact_cost_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  artifact_id TEXT,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,                -- 'generate', 'upload', 'transcode', 'transcribe'

  input_size INTEGER,                     -- Bytes or chars
  output_size INTEGER,                    -- Bytes
  duration_ms INTEGER,                    -- Tempo de processamento

  cost_amount REAL,
  cost_currency TEXT DEFAULT 'USD',

  status TEXT NOT NULL,                   -- 'success' | 'failed' | 'partial'
  error_message TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (artifact_id) REFERENCES marketing_artifacts(id),
  INDEX idx_agent_id (agent_id),
  INDEX idx_created_at (created_at),
  INDEX idx_provider (provider)
);

-- Credenciais de provedores (integrar com comunicação)
-- Reutilizar: provider_configurations + provider_credentials
-- Adicionar tipos: 'nanobanana' | 'vimeo' | 'tts' | 'stt'
```

### 5.3 Estrutura Drizzle ORM

```typescript
// packages/mastra-engine/src/db/schema.ts

import { sqliteTable, text, integer, real, timestamp } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export const marketingArtifacts = sqliteTable('marketing_artifacts', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  agentId: text().notNull(),
  type: text().$type<'image' | 'video' | 'audio' | 'animation'>().notNull(),
  source: text().$type<'nanobanana' | 'vimeo' | 'tts' | 'stt' | 'external'>().notNull(),
  sourceId: text().notNull(),

  title: text(),
  description: text(),
  tags: text(), // JSON array

  url: text().notNull(),
  localPath: text(),
  cdnUrl: text(),

  prompt: text(),
  inputText: text(),
  inputAudioUrl: text(),

  mimeType: text().notNull(),
  fileSize: integer(),
  duration: integer(), // Segundos
  resolution: text(),

  status: text().$type<'pending' | 'completed' | 'failed' | 'archived'>().notNull(),
  version: integer().notNull().default(1),

  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  expiresAt: timestamp(),

  costProvider: text(),
  costAmount: real(),
  costCurrency: text().default('USD'),
}, (table) => ({
  idxAgentId: index().on(table.agentId),
  idxType: index().on(table.type),
  idxSource: index().on(table.source),
  idxCreatedAt: index().on(table.createdAt),
  idxStatus: index().on(table.status),
}));

export const artifactSimilarityCache = sqliteTable('artifact_similarity_cache', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  artifactId: text().notNull().references(() => marketingArtifacts.id, { onDelete: 'cascade' }),
  source: text().notNull(),
  contentHash: text().notNull(),
  similarityScore: real(),
  matchedArtifactId: text().references(() => marketingArtifacts.id),

  createdAt: timestamp().notNull().defaultNow(),
  expiresAt: timestamp(),
}, (table) => ({
  uniqueCache: uniqueIndex().on(table.contentHash, table.source),
  idxExpiresAt: index().on(table.expiresAt),
}));

export const artifactCostLog = sqliteTable('artifact_cost_log', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  agentId: text().notNull(),
  artifactId: text().references(() => marketingArtifacts.id),
  provider: text().notNull(),
  operation: text().$type<'generate' | 'upload' | 'transcode' | 'transcribe'>().notNull(),

  inputSize: integer(),
  outputSize: integer(),
  durationMs: integer(),

  costAmount: real(),
  costCurrency: text().default('USD'),

  status: text().$type<'success' | 'failed' | 'partial'>().notNull(),
  errorMessage: text(),

  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxAgentId: index().on(table.agentId),
  idxCreatedAt: index().on(table.createdAt),
  idxProvider: index().on(table.provider),
}));

// Relations
export const marketingArtifactsRelations = relations(marketingArtifacts, ({ many }) => ({
  costLogs: many(artifactCostLog),
  cacheEntries: many(artifactSimilarityCache),
}));
```

### 5.4 Provider Interface Pattern

```typescript
// packages/mastra-engine/src/agent/marketing-artifacts/providers/types.ts

export interface ImageProvider {
  generateImage(params: {
    prompt: string;
    style?: string;
    resolution?: string;
    format?: 'png' | 'jpg' | 'webp';
    seed?: number;
  }): Promise<{
    url: string;
    id: string;
    width: number;
    height: number;
  }>;

  generateVariations(params: {
    prompt: string;
    count: number;
    style?: string;
  }): Promise<Array<{ url: string; id: string }>>;

  validatePrompt(prompt: string): Promise<{ valid: boolean; error?: string }>;
}

export interface VideoProvider {
  uploadVideo(params: {
    fileBuffer: Buffer;
    filename: string;
    metadata: {
      title: string;
      description?: string;
      tags?: string[];
    };
    visibility?: 'private' | 'internal' | 'public';
  }): Promise<{
    videoId: string;
    playerUrl: string;
    cdnUrl: string;
  }>;

  updateMetadata(videoId: string, metadata: Record<string, unknown>): Promise<void>;

  getVideoStatus(videoId: string): Promise<{
    status: 'uploading' | 'processing' | 'ready' | 'failed';
    progress?: number;
  }>;
}

export interface TTSProvider {
  synthesizeSpeech(params: {
    text: string;
    voice: string;
    language: string;
    speed?: number;
    format?: 'mp3' | 'wav' | 'ogg';
  }): Promise<{
    audioUrl: string;
    durationSeconds: number;
    format: string;
  }>;

  listVoices(): Promise<Array<{
    id: string;
    name: string;
    language: string;
    gender?: string;
  }>>;
}

export interface STTProvider {
  transcribeAudio(params: {
    audioUrl: string;
    language: string;
    returnTimestamps?: boolean;
  }): Promise<{
    text: string;
    confidence: number;
    timestamps?: Array<{ word: string; time: number; confidence: number }>;
  }>;
}
```

### 5.5 Implementação de Provider (Exemplo: Nanobanana)

```typescript
// packages/mastra-engine/src/agent/marketing-artifacts/providers/image/nanobanana.ts

import { ImageProvider } from '../types';

const NANOBANANA_API_BASE = 'https://api.nanobanana.ai/v1';

export class NanobananaProvider implements ImageProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Nanobanana API key required');
    this.apiKey = apiKey;
  }

  async generateImage(params: {
    prompt: string;
    style?: string;
    resolution?: string;
    format?: 'png' | 'jpg' | 'webp';
    seed?: number;
  }): Promise<{ url: string; id: string; width: number; height: number }> {
    const requestBody = {
      prompt: params.prompt,
      style: params.style || 'photorealistic',
      resolution: params.resolution || '1024x1024',
      format: params.format || 'png',
      ...(params.seed !== undefined && { seed: params.seed }),
    };

    const response = await fetch(`${NANOBANANA_API_BASE}/images/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Nanobanana API error: ${error.message}`);
    }

    const data = await response.json();

    return {
      url: data.image_url,
      id: data.image_id,
      width: parseInt(params.resolution?.split('x')[0] || '1024'),
      height: parseInt(params.resolution?.split('x')[1] || '1024'),
    };
  }

  async generateVariations(params: {
    prompt: string;
    count: number;
    style?: string;
  }): Promise<Array<{ url: string; id: string }>> {
    const promises = Array.from({ length: params.count }, (_, i) =>
      this.generateImage({
        prompt: params.prompt,
        style: params.style,
        seed: Math.floor(Math.random() * 100000),
      })
    );

    const results = await Promise.all(promises);
    return results.map(r => ({ url: r.url, id: r.id }));
  }

  async validatePrompt(prompt: string): Promise<{ valid: boolean; error?: string }> {
    if (!prompt || prompt.length === 0) {
      return { valid: false, error: 'Prompt cannot be empty' };
    }
    if (prompt.length > 2000) {
      return { valid: false, error: 'Prompt too long (max 2000 characters)' };
    }

    // Verificar conteúdo proibido (simples check)
    const forbiddenKeywords = ['violence', 'hate', 'explicit'];
    if (forbiddenKeywords.some(kw => prompt.toLowerCase().includes(kw))) {
      return { valid: false, error: 'Prompt contains forbidden content' };
    }

    return { valid: true };
  }
}
```

### 5.6 Camada de Abstração (Artifact Manager)

```typescript
// packages/mastra-engine/src/agent/marketing-artifacts/storage/artifact-manager.ts

import { db } from '../../db';
import { marketingArtifacts, artifactSimilarityCache, artifactCostLog } from '../../db/schema';
import { Artifact } from '../models';
import type { ImageProvider, VideoProvider, TTSProvider, STTProvider } from '../providers/types';

export class ArtifactManager {
  private imageProvider: ImageProvider;
  private videoProvider: VideoProvider;
  private ttsProvider: TTSProvider;
  private sttProvider: STTProvider;

  constructor(providers: {
    image: ImageProvider;
    video: VideoProvider;
    tts: TTSProvider;
    stt: STTProvider;
  }) {
    this.imageProvider = providers.image;
    this.videoProvider = providers.video;
    this.ttsProvider = providers.tts;
    this.sttProvider = providers.stt;
  }

  async generateImage(
    agentId: string,
    prompt: string,
    options?: { style?: string; resolution?: string }
  ): Promise<Artifact> {
    // 1. Validar prompt
    const validation = await this.imageProvider.validatePrompt(prompt);
    if (!validation.valid) {
      throw new Error(`Invalid prompt: ${validation.error}`);
    }

    // 2. Verificar cache de similaridade
    const cached = await this.checkSimilarityCache('nanobanana', prompt);
    if (cached) {
      return cached; // Reutilizar
    }

    // 3. Gerar imagem
    const startTime = Date.now();
    let imageData;
    try {
      imageData = await this.imageProvider.generateImage({
        prompt,
        style: options?.style,
        resolution: options?.resolution,
      });
    } catch (error) {
      // Logar falha
      await this.logCost(agentId, null, 'nanobanana', 'generate', 0, 0, 'failed', error.message);
      throw error;
    }

    const durationMs = Date.now() - startTime;

    // 4. Salvar em BD
    const artifact: Artifact = {
      id: uuid(),
      agentId,
      type: 'image',
      source: 'nanobanana',
      sourceId: imageData.id,
      url: imageData.url,
      prompt,
      mimeType: 'image/png',
      fileSize: 0, // Estimado
      resolution: options?.resolution || '1024x1024',
      createdAt: new Date(),
      status: 'completed',
      version: 1,
    };

    await db.insert(marketingArtifacts).values({
      id: artifact.id,
      agentId: artifact.agentId,
      type: artifact.type,
      source: artifact.source,
      sourceId: artifact.sourceId,
      url: artifact.url,
      prompt: artifact.prompt,
      mimeType: artifact.mimeType,
      resolution: artifact.resolution,
      status: artifact.status,
      createdAt: artifact.createdAt,
      updatedAt: artifact.createdAt,
    });

    // 5. Logar custo
    await this.logCost(agentId, artifact.id, 'nanobanana', 'generate', prompt.length, 0, 'success');

    // 6. Adicionar ao cache de similaridade
    await this.updateSimilarityCache('nanobanana', prompt, artifact.id);

    return artifact;
  }

  async checkSimilarityCache(source: string, content: string): Promise<Artifact | null> {
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    const cached = await db
      .select()
      .from(artifactSimilarityCache)
      .where(
        and(
          eq(artifactSimilarityCache.contentHash, contentHash),
          eq(artifactSimilarityCache.source, source)
        )
      )
      .limit(1);

    if (cached.length === 0 || !cached[0].matchedArtifactId) return null;

    // Verificar se cache ainda está válido
    if (cached[0].expiresAt && cached[0].expiresAt < new Date()) {
      return null; // Cache expirado
    }

    const artifact = await db
      .select()
      .from(marketingArtifacts)
      .where(eq(marketingArtifacts.id, cached[0].matchedArtifactId))
      .limit(1);

    return artifact.length > 0 ? (artifact[0] as Artifact) : null;
  }

  private async updateSimilarityCache(source: string, content: string, artifactId: string) {
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL

    await db.insert(artifactSimilarityCache).values({
      id: uuid(),
      artifactId,
      source,
      contentHash,
      matchedArtifactId: artifactId,
      expiresAt,
    });
  }

  private async logCost(
    agentId: string,
    artifactId: string | null,
    provider: string,
    operation: string,
    inputSize: number,
    outputSize: number,
    status: 'success' | 'failed',
    errorMessage?: string
  ) {
    await db.insert(artifactCostLog).values({
      id: uuid(),
      agentId,
      artifactId,
      provider,
      operation: operation as any,
      inputSize,
      outputSize,
      status,
      errorMessage,
    });
  }
}
```

---

## 6. Plano de Implementação

### Fase 1: Setup e Infraestrutura (Sprint 1 — 2 semanas)
- [ ] Definir schema Drizzle para marketing_artifacts, artifact_similarity_cache, artifact_cost_log
- [ ] Criar migrations de banco de dados
- [ ] Setup de criptografia para credenciais (reutilizar de RF-02)
- [ ] Estender provider_configurations para suportar tipos 'nanobanana', 'vimeo', 'tts', 'stt'
- [ ] Criar tipos e interfaces base (Artifact, ImageProvider, VideoProvider, TTSProvider, STTProvider)
- [ ] Testes unitários para schema e tipos

### Fase 2: Implementação de Provedores (Sprint 2 — 2 semanas)
- [ ] Implementar NanobanaProvider (generateImage, generateVariations, validatePrompt)
- [ ] Implementar VimeoProvider (uploadVideo, updateMetadata, getVideoStatus)
- [ ] Implementar TTSProvider (ElevenLabs ou Google Cloud)
- [ ] Implementar STTProvider (OpenAI Whisper ou Google Cloud)
- [ ] Testes de integração com APIs reais (sandbox/test environments)
- [ ] Tratamento de erros e retries (exponential backoff, circuit breaker)

### Fase 3: Artifact Manager e Storage (Sprint 3 — 2 semanas)
- [ ] Implementar ArtifactManager (generateImage, uploadVideo, synthesizeSpeech, transcribeAudio)
- [ ] Implementar cache de similaridade (fuzzy matching, content hash)
- [ ] Implementar logging de custos e auditoria
- [ ] Setup de fila assíncrona para long-running tasks (Bull, Bee-Queue ou custom)
- [ ] Testes de cache hit/miss, auditoria

### Fase 4: Agent-Facing Tools (Sprint 4 — 2 semanas)
- [ ] Implementar tools.generateImage, tools.generateImageVariations
- [ ] Implementar tools.uploadVideo, tools.updateVideoMetadata, tools.getVideoPlayer
- [ ] Implementar tools.synthesizeSpeech, tools.synthesizeMultipleVoices
- [ ] Implementar tools.transcribeAudio, tools.transcribeAudioBatch
- [ ] Implementar tools.listArtifacts, tools.getArtifact, tools.deleteArtifact
- [ ] Integrar com createForgeAgent para registrar tools
- [ ] Testes end-to-end com agente

### Fase 5: Otimização e Documentação (Sprint 5 — 1.5 semanas)
- [ ] Performance benchmark (geração, caching, lookup)
- [ ] Security audit (criptografia, rate limiting, validação de conteúdo)
- [ ] Documentação de API (params, returns, errors)
- [ ] Documentação de setup (como configurar provedores, gerar chaves)
- [ ] Documentação de operação (monitoramento, troubleshooting)

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| API Nanobanana down ou instável | Média | Alto | Implementar circuit breaker, fallback para provider alternativo (se houver) |
| Custo de APIs sobe inesperadamente | Média | Médio | Implementar rate limiting, quotas por agente, alertas de custo |
| Validação de conteúdo insuficiente (NSFW, abuso) | Média | Crítico | Integrar com moderação de conteúdo (simples regex + futura: AI moderation) |
| Falha parcial (imagem gerada mas erro ao salvar BD) | Baixa | Médio | Transações com compensação, retry idempotente |
| Cache de TTS/imagens causa stale data | Baixa | Médio | Implementar TTL rigoroso, invalidação manual se necessário |
| Upload de vídeo grande timeout | Média | Médio | Chunked upload, resumable uploads via Vimeo |
| Credenciais de provedores comprometidas | Baixa | Crítico | Criptografia em repouso, rotation automática, audit log |
| Rate limit de API terceira atingida | Média | Alto | Queue com limite de throughput, exponential backoff |
| Performance de STT lenta (2x+ duração) | Baixa | Médio | Processamento assíncrono em fila, notificações webhook |

---

## 8. Métricas de Sucesso

### Técnicas
- [ ] 100% de cobertura de testes para providers (unit + integration)
- [ ] Tempo de geração de imagem < 30s (end-to-end)
- [ ] Tempo de upload de vídeo < 5 min (para vídeo 50MB)
- [ ] Tempo de TTS < 10s (para até 500 caracteres)
- [ ] Tempo de lookup de artefato < 50ms
- [ ] Cache hit rate > 20% para imagens, > 40% para TTS
- [ ] Success rate de operações > 98% (falhas raras)
- [ ] Zero credenciais em plaintext em BD (audit)

### Funcionais
- [ ] Agente consegue gerar imagens em prompts em português e inglês
- [ ] Agente consegue fazer upload e manipular vídeos em Vimeo
- [ ] Agente consegue sintetizar fala em múltiplas vozes
- [ ] Agente consegue transcrever áudio com > 90% accuracy
- [ ] Auditoria completa (rastrear agente, tipo, timestamp, custo)
- [ ] Reutilização de artefatos similares funciona (detecção de duplicados)

### de Negócio
- [ ] Reduzir tempo de criação de material marketing de horas para minutos
- [ ] Suportar 1000+ variações de asset por campanha
- [ ] Aumentar velocidade de iteração criativa (feedback loop)
- [ ] Rastrear custos com terceiros (visibilidade)

---

## 9. Dependências Externas

### Internas
- Drizzle ORM (já em uso para RF-02)
- crypto (Node.js native)
- zod (já existente)
- Job queue system (Bull, Bee-Queue, ou custom)

### Externas
- **Nanobanana API:** Image generation (pode ser substituído por Stability AI, Midjourney, etc)
- **Vimeo API:** Video hosting e manipulação (essential para vídeos, pode ser Cloudflare Stream alternativa)
- **TTS Provider:** ElevenLabs, Google Cloud TTS, AWS Polly (configurável)
- **STT Provider:** OpenAI Whisper API, Google Cloud STT, AWS Transcribe (configurável)

### Compatibilidade
- Node.js 18+ (crypto, fetch, async)
- LibSQL (SQLite) ✅ Compatível com Drizzle
- Suportar HTTPS para todas as APIs

---

## 10. Estimativas

### Tamanho da Feature
**Esforço total:** ~150-180 horas (5 sprints de 2-3 semanas)

### Breakdown por Fase
1. **Phase 1 (Setup):** 25h (Schema, tipos, criptografia)
2. **Phase 2 (Providers):** 50h (Nanobanana, Vimeo, TTS, STT + integration tests)
3. **Phase 3 (Manager):** 40h (ArtifactManager, cache, auditoria, fila)
4. **Phase 4 (Tools):** 30h (Agent tools, integração com createForgeAgent)
5. **Phase 5 (Otimização/Docs):** 20h (Benchmarks, security audit, docs)

### Story Points (Fibonacci)
- [ ] Epic PRD-32: 55 story points (5 sprints, 1-2 devs full-time)

---

## 11. Documentação Necessária

### Para Desenvolvedores
1. `docs/implementation/marketing-artifacts-setup.md` — Setup inicial, rodas locais
2. `docs/implementation/artifact-providers-api.md` — API reference para providers
3. `docs/implementation/nanobanana-integration.md` — Específico Nanobanana
4. `docs/implementation/vimeo-integration.md` — Específico Vimeo
5. `docs/implementation/tts-stt-providers.md` — Configuração de TTS/STT
6. `docs/implementation/artifact-caching.md` — Como funciona similaridade cache

### Para Operadores
1. `docs/operations/artifact-generation-monitoring.md` — Métricas, alertas
2. `docs/operations/provider-credential-management.md` — Rotação de chaves
3. `docs/operations/cost-tracking.md` — Como rastrear gastos com APIs
4. `docs/operations/troubleshooting-artifacts.md` — Debugging de falhas
5. `docs/operations/artifact-storage-cleanup.md` — Limpeza de artefatos antigos

### Para Agentes/Usuários
1. `docs/agent-api/artifact-tools.md` — Referência de tools disponíveis
2. `docs/agent-api/artifact-examples.md` — Exemplos de uso (gerar imagem, sintetizar fala)

---

## 12. Critérios de Aceitação

- [ ] Schema Drizzle para marketing_artifacts, artifact_similarity_cache, artifact_cost_log criado
- [ ] Migrations de BD criadas e testadas
- [ ] NanobanaProvider implementado com testes
- [ ] VimeoProvider implementado com testes
- [ ] TTSProvider implementado com suporte a múltiplas vozes
- [ ] STTProvider implementado com transcription accuracy testado
- [ ] ArtifactManager implementado com cache de similaridade
- [ ] Logging de custos e auditoria funcionando
- [ ] Job queue para long-running tasks implementada
- [ ] Tools registradas em createForgeAgent (generateImage, uploadVideo, synthesizeSpeech, transcribeAudio, etc)
- [ ] Testes end-to-end com agente gerando múltiplos tipos de artefatos
- [ ] Documentação completa (dev + ops + agent API)
- [ ] Security audit passed (criptografia, validação, rate limiting)
- [ ] Performance benchmark passou (< 30s geração imagem, < 50ms lookup)
- [ ] Zero plain-text credenciais em BD (auditado)
- [ ] Backwards compatibility com existentes agent tools

---

## 13. Próximos Passos Recomendados

### Imediato (Antes de iniciar Phase 1)
1. **Revisar com time:** Apresentar PRD para architectural review
2. **Validar provedores:** Confirmar Nanobanana, Vimeo, TTS provider (ElevenLabs?)
3. **Setup de contas de teste:** Criar accounts/API keys para Nanobanana, Vimeo, TTS
4. **Decidir job queue:** Bull? Bee-Queue? Custom com Redis?
5. **Ambiente de teste:** Criar branch para desenvolvimento

### Após Phase 1
1. **Moderação de conteúdo:** Integrar com content moderation API (simples + futura: AI)
2. **Webhooks de notificação:** Notificar quando artefatos estiverem prontos (async)
3. **Análise de imagem:** Extrair tags/descrição automática de imagens geradas (future)
4. **Multi-language TTS:** Suportar mais idiomas
5. **Video analytics:** Rastrear visualizações/engajamento de vídeos hospedados

### Longo Prazo
1. Dashboard de gerenciamento de artefatos (UI)
2. Integração com workflow de distribuição/publicação em sociais
3. A/B testing de variações de artefatos
4. Análise de custo/ROI por tipo de artefato
5. Integração com generative AI avançado (voice cloning, synthetic actors, etc)

---

**Preparado por:** Análise Detalhada (Agent)
**Data:** 2026-03-15
**Próxima revisão:** Após Phase 1 (discussão técnica com time)

---

## Apêndice A: Exemplo de Uso End-to-End

### Scenario: Agente Gera Campanha de Marketing com Imagem + Narração

```typescript
// 1. Setup: Registrar credenciais de providers
await registerProviderConfig(db, {
  agentId: 'marketing-bot-1',
  providerId: 'nanobanana-main',
  providerType: 'nanobanana',
  configJson: { model: 'v2' },
  secrets: { apiKey: 'nb-key-here' },
});

await registerProviderConfig(db, {
  agentId: 'marketing-bot-1',
  providerId: 'vimeo-main',
  providerType: 'vimeo',
  configJson: { accountId: 'acc-123' },
  secrets: { accessToken: 'vimeo-token-here' },
});

await registerProviderConfig(db, {
  agentId: 'marketing-bot-1',
  providerId: 'elevenlabs-main',
  providerType: 'tts',
  configJson: { provider: 'elevenlabs' },
  secrets: { apiKey: 'elevenlabs-key-here' },
});

// 2. Criar agente com marketing artifact tools
const agent = await createForgeAgent({
  agentId: 'marketing-bot-1',
  name: 'Marketing Bot',
  // Tools são registradas automaticamente via module
});

// 3. Usar agent para gerar campanha
const campaign = await agent.run({
  goal: 'Criar campanha de marketing para novo produto XYZ com imagem, texto e narração em português',
  context: { productName: 'XYZ', features: ['AI-powered', 'fast', 'secure'] },
});

// Dentro do agent, chama:
// a) Gerar imagem
const imageArtifact = await tools.generateImage(
  'Modern tech product showcase, sleek design, blue and silver, professional studio lighting',
  { resolution: '1920x1080', style: 'photorealistic' }
);
// Retorna: { id: 'art-123', url: 'https://cdn...', prompt: '...', ... }

// b) Sintetizar narração
const voiceArtifact = await tools.synthesizeSpeech(
  'Bem-vindo ao XYZ. Produto revolucionário com inteligência artificial. Rápido, seguro, inovador.',
  { voice: 'female-professional', language: 'pt-BR', speed: 1.0 }
);
// Retorna: { id: 'art-124', url: 'https://audio.cdn...', duration: 12 }

// c) Listar artefatos gerados
const artifacts = await tools.listArtifacts({
  agentId: 'marketing-bot-1',
  type: ['image', 'audio'],
  createdAfter: new Date(Date.now() - 1000 * 60 * 60), // Última hora
});
// Retorna: [ { id, type, url, createdAt, ... }, ... ]

// 4. Artefatos podem ser usados em próximas etapas (distribuição, análise, etc)
console.log('Campanha criada:');
console.log(`- Imagem: ${imageArtifact.url}`);
console.log(`- Narração: ${voiceArtifact.url} (${voiceArtifact.duration}s)`);
console.log(`- Total artefatos: ${artifacts.length}`);
```

---

**FIM DO DOCUMENTO**
