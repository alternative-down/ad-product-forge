# PRD-20: Ferramentas de Geração de Artefato de Marketing

> Status: planned. This document does not describe implemented behavior unless explicitly stated.

**Status:** Planejamento
**Data:** 2026-03-15
**Versão:** 1.0

---

## Nota de Projeto Pessoal

Este é um projeto de desenvolvimento pessoal. Recursos seguem princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It). Escopo foca em funcionalidade core para fluxo de trabalho de desenvolvedor solo.

---

## 1. Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de geração de conteúdo específica do ad-product-forge.** A geração de artefato de marketing permite que agentes de Nicolas criem autonomamente conteúdo visual e de áudio para campanhas de marketing. Esta é tooling de marketing específica da aplicação, não infraestrutura de framework.

**Objetivo:** Fornecer ferramentas para agentes gerarem artefatos de marketing (imagens, áudio) programaticamente usando serviços externos.

**Por que (para ad-product-forge):** Agentes de marketing de Nicolas devem conseguir criar conteúdo visual e de áudio sem intervenção manual. Permite execução autônoma de campanha de marketing.

**Prioridade:** Média
**Timeline:** 2-3 semanas

---

## 2. Problema

- Agentes conseguem apenas trabalhar com conteúdo de texto
- Nenhuma forma de gerar imagens programaticamente
- Nenhuma síntese de áudio ou capacidades de transcrição
- Não conseguem gerenciar e rastrear ativos gerados

---

## 3. Casos de Uso

1. **Agente gera imagens de marketing:** Agente cria imagens de produto para listagem
2. **Agente sintetiza narração:** Agente converte conteúdo escrito em áudio
3. **Agente transcreve áudio:** Agente converte áudio em texto para processamento
4. **Agente rastreia artefatos:** Agente consulta ativos gerados anteriormente para evitar duplicação

---

## 4. Requisitos

### Características Core

**FR1: Geração de Imagem**

- Gerar imagens de prompts de texto usando serviço externo (ex: Nanobanana)
- Especificar: prompt, estilo, resolução, formato
- Retornar: URL de imagem, metadados (tamanho, resolução)
- Cache de resultados para evitar regeneração de mesmo prompt

**FR2: Text-to-Speech (TTS)**

- Converter texto em áudio usando serviço externo
- Especificar: texto, tipo de voz, idioma, velocidade
- Retornar: URL de áudio, duração
- Suportar múltiplas opções de voz
- Cache de resultados para evitar regeneração de mesmo texto

**FR3: Speech-to-Text (STT)**

- Transcrever arquivos de áudio usando serviço externo
- Especificar: URL de áudio, idioma
- Retornar: texto transcrito, score de confiança
- Suportar transcrição em lote com limites de concorrência

**FR4: Armazenamento & Rastreamento de Artefato**

- Armazenar metadados de artefato em banco de dados (tipo, URL, fonte, ID de agente, timestamp de criação)
- Consultar artefatos por agente e tipo
- Deletar artefatos
- Cache simples para prevenir geração duplicada

### Ferramentas Voltadas para Agente

```typescript
generateImage(prompt: string, options?: {style, resolution}): Promise<{url, metadata}>
synthesizeAudio(text: string, options?: {voice, language}): Promise<{url, duration}>
transcribeAudio(audioUrl: string, language?: string): Promise<{text}>
listArtifacts(filters?: {agentId, type}): Promise<Artifact[]>
deleteArtifact(artifactId: string): Promise<void>
```

---

## 5. Critérios de Sucesso

- Agentes conseguem gerar imagens e áudio sem passos manuais
- Geração de imagem se completa em <30 segundos
- Síntese de áudio se completa em <10 segundos
- Cache previne chamadas de API duplicadas para requisições idênticas
- Todos artefatos são rastreados em banco de dados com metadados apropriados
- Agentes não conseguem acessar artefatos de outros agentes (isolamento)

---

## 6. Requisitos Não-Funcionais

**Performance:**

- Geração de imagem: <30 segundos
- Síntese de áudio: <10 segundos
- Lookup de artefato: rápido o suficiente para um desenvolvedor

**Confiabilidade:**

- Chamadas de API falhadas não crasheam agente
- Lógica de retry básica para falhas transitórias
- Mensagens de erro claras

**Segurança:**

- Credenciais de API armazenadas em variáveis de ambiente
- Nenhuma vazão de credencial em logs

---

## 7. Escopo

### Incluído

- Geração de imagem via API externa
- Síntese text-to-speech
- Transcrição speech-to-text
- Armazenamento de metadados de artefato
- Cache simples para prevenir geração duplicada

### Não Incluído

- Geração ou hosting de vídeo
- Edição avançada de imagem
- Treinamento de voz customizado
- Streaming em tempo real
- Rastreamento de custo/billing
- Analytics avançado

---

## 8. Abordagem Técnica

### Schema do Banco de Dados

**`forge_artifacts` table:**

```
- artifact_id (UUID, chave primária)
- agent_id (UUID)
- type (ENUM: image, audio)
- source (ENUM: nanobanana, tts, stt)
- url (VARCHAR) -- URL de acesso público
- prompt (TEXT, nullable) -- para imagens
- input_text (TEXT, nullable) -- para TTS
- metadata (JSON) -- tamanho, duração, resolução
- created_at (TIMESTAMP)
```

---

## 9. Serviços Externos

- **Geração de Imagem:** API Nanobanana (ou alternativa)
- **Text-to-Speech:** ElevenLabs, Google Cloud TTS, ou AWS Polly
- **Speech-to-Text:** OpenAI Whisper, Google Cloud STT, ou AWS Transcribe

Todas credenciais armazenadas em variáveis de ambiente e criptografadas em banco de dados.
