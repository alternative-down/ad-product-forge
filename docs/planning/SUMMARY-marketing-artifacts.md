# PRD 32: Marketing Artifact Generation Tools — Sumário Executivo

**Arquivo Completo:** `prd-32-marketing-artifact-generation-tools.md`
**Data:** 2026-03-15
**Status:** Draft - Ready for Architectural Review

---

## Visão Geral

**PRD 32** fornece um framework completo para que agentes criem, gerenciem e façam deploy de artefatos de marketing (imagens, vídeos, áudio) de forma programática através de integrações especializadas.

### Objetivo Primário
Automatizar geração de materiais criativos de marketing, permitindo agentes criarem variações de conteúdo visual e auditivo em escala, sem intervenção manual.

### Valor Agregado
- Automação completa de criação de assets
- Qualidade profissional via parceiros (Nanobanana, Vimeo)
- Suporte multimodal (imagem, vídeo, áudio)
- Escalabilidade: 100+ variações por campanha
- Rastreamento completo de custos e auditoria

---

## Requisitos Funcionais (Síntese)

### 1. Geração de Imagens (Nanobanana)
- `generateImage(prompt, style, resolution)` → URL + metadata
- Suporte para: photorealistic, illustration, cartoon, abstract, commercial
- Resoluções: 512x512 até 1024x1024+
- Cache de similaridade: reutilizar em 24h se mesmo prompt
- Detecção de conteúdo proibido

### 2. Manipulação de Vídeos (Vimeo)
- Upload: `uploadVideo(file, metadata, visibility)`
- Metadata: Atualizar título, descrição, tags, permissões
- Transcodificação: Múltiplas resoluções e formatos
- Thumbnails: Extrair frames específicos
- Status polling: Rastrear transcodificação

### 3. Síntese de Áudio (TTS)
- `synthesizeSpeech(text, voice, language, speed, format)`
- Múltiplas vozes: male-neutral, female-professional, etc
- Idiomas: en-US, pt-BR, es-ES, fr-FR
- Cache de TTS: 7 dias, reutilizar se idêntico
- Providers: ElevenLabs, Google Cloud TTS, AWS Polly

### 4. Transcrição de Áudio (STT)
- `transcribeAudio(audioUrl, language)` → texto + confiança
- Transcrição em lote com limite de concorrência
- Timestamps por palavra (opcional)
- Providers: OpenAI Whisper, Google Cloud STT, AWS Transcribe

### 5. Abstração de Artefatos
- Modelo unificado: `Artifact` (image, video, audio, animation)
- Banco de dados: `marketing_artifacts` com auditoria completa
- Metadados: title, description, tags, resolution, duration, status
- Custo tracking: provider, amount, currency, timestamp

### 6. Agent-Facing Tools
```typescript
// Imagem
tools.generateImage()
tools.generateImageVariations()

// Vídeo
tools.uploadVideo()
tools.updateVideoMetadata()
tools.getVideoPlayer()

// Áudio (síntese)
tools.synthesizeSpeech()
tools.synthesizeMultipleVoices()

// Áudio (transcrição)
tools.transcribeAudio()
tools.transcribeAudioBatch()

// Consulta
tools.listArtifacts()
tools.getArtifact()
tools.deleteArtifact()
```

---

## Requisitos Não-Funcionais (Síntese)

| Categoria | Requisito | Target |
|-----------|-----------|--------|
| **Performance** | Geração imagem | <30s |
| | Upload vídeo | <5min |
| | TTS | <10s |
| | STT | <2x duração |
| | Lookup de artefato | <50ms |
| **Confiabilidade** | Retry automático | Exponential backoff |
| | Circuit breaker | Para APIs degradadas |
| **Segurança** | Criptografia de credenciais | AES-256-GCM |
| | Validação de conteúdo | Prompts, imagens, vídeos |
| | Rate limiting | Por agente/API key |
| **Escalabilidade** | Agentes simultâneos | 1000+ |
| | Artefatos por agente | 10 000+ |
| | Processamento | Fila assíncrona |
| **Auditoria** | Rastreamento | Agente, tipo, timestamp, custo |
| | Retenção | 90 dias (archive possível) |

---

## Arquitetura (Síntese)

### Estrutura de Banco de Dados
```
marketing_artifacts
├─ id, agentId, type, source, sourceId
├─ title, description, tags
├─ url, localPath, cdnUrl
├─ prompt, inputText, inputAudioUrl
├─ mimeType, fileSize, duration, resolution
├─ status, version, createdAt, updatedAt, expiresAt
└─ costProvider, costAmount, costCurrency

artifact_similarity_cache
├─ id, artifactId, source
├─ contentHash, similarityScore, matchedArtifactId
└─ createdAt, expiresAt (TTL: 24h imagens, 7d TTS)

artifact_cost_log
├─ id, agentId, artifactId
├─ provider, operation (generate, upload, transcode, transcribe)
├─ inputSize, outputSize, durationMs
├─ costAmount, status, errorMessage
└─ createdAt
```

### Padrão de Provider
Cada integração implementa interface padrão:
- `ImageProvider` (generateImage, generateVariations, validatePrompt)
- `VideoProvider` (uploadVideo, updateMetadata, getVideoStatus)
- `TTSProvider` (synthesizeSpeech, listVoices)
- `STTProvider` (transcribeAudio)

### Camada de Abstração (ArtifactManager)
- Orquestra providers
- Gerencia similaridade cache
- Logs de custo e auditoria
- Fila assíncrona para long-running tasks

---

## Roadmap de Implementação

### Fase 1: Setup (2 semanas, 25h)
- [ ] Schema Drizzle + migrations
- [ ] Tipos e interfaces base
- [ ] Criptografia de credenciais
- [ ] Testes unitários

### Fase 2: Provedores (2 semanas, 50h)
- [ ] NanobanaProvider
- [ ] VimeoProvider
- [ ] TTSProvider (ElevenLabs)
- [ ] STTProvider (Whisper/Google)
- [ ] Testes de integração

### Fase 3: Storage e Manager (2 semanas, 40h)
- [ ] ArtifactManager
- [ ] Cache de similaridade
- [ ] Logging de custos
- [ ] Fila assíncrona
- [ ] Testes

### Fase 4: Agent Tools (2 semanas, 30h)
- [ ] Tools: generateImage, uploadVideo, synthesizeSpeech, etc
- [ ] Integração com createForgeAgent
- [ ] Testes end-to-end

### Fase 5: Otimização (1.5 semanas, 20h)
- [ ] Benchmarks de performance
- [ ] Security audit
- [ ] Documentação completa

**Total:** 5 sprints, ~150-180h, 55 story points

---

## Riscos Principais (Top 3)

| Risco | Mitigação |
|-------|-----------|
| Custo de APIs sobe | Rate limiting, quotas, alertas |
| Conteúdo inadequado (NSFW) | Validação inicial + moderação AI futura |
| Rate limit de API atingido | Queue com limite de throughput, exponential backoff |

---

## Métricas de Sucesso

### Técnicas
- [x] <30s geração imagem
- [x] <5min upload vídeo
- [x] <10s TTS
- [x] <50ms lookup artefato
- [x] >20% cache hit rate imagens
- [x] >98% success rate operações
- [x] 0 credenciais em plaintext

### Funcionais
- [x] Múltiplas vozes TTS
- [x] >90% accuracy STT
- [x] Auditoria completa
- [x] Detecção de duplicados funcionando

### Business
- [x] Material marketing: horas → minutos
- [x] 1000+ variações por campanha
- [x] Rastreamento completo de custos

---

## Decisões de Design Principais

1. **Provider Pattern:** Extensível para múltiplos provedores de imagem/TTS
2. **Unified Artifact Model:** Um tipo (Artifact) para todos os tipos de mídia
3. **Similarity Cache com TTL:** Reutilização automática em 24h (imagens) e 7d (TTS)
4. **Async Processing:** Fila para uploads de vídeo, transcodificação longa
5. **Cost Tracking:** Auditoria de cada operação com provider + amount
6. **Encryption at Rest:** Credenciais sempre criptografadas (AES-256-GCM)

---

## Próximos Passos (Antes de Phase 1)

1. [ ] Revisar PRD com time de arquitetura
2. [ ] Confirmar: Nanobanana, Vimeo, TTS provider, STT provider
3. [ ] Criar test accounts e API keys
4. [ ] Decidir job queue system (Bull? Bee-Queue? Custom?)
5. [ ] Setup branch de desenvolvimento

---

## Links Relacionados

- **PRD Principal:** `/docs/planning/prd-32-marketing-artifact-generation-tools.md`
- **PRD 02 (Communication):** `/docs/planning/prd-02-communication-provider-integration.md`
- **Roadmap:** `/docs/ROADMAP.md`

---

**Preparado por:** Análise Detalhada
**Última atualização:** 2026-03-15
