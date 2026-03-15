# PRD-32: Marketing Artifact Generation Tools

**Status:** Planning
**Date:** 2026-03-15
**Version:** 1.0

---

## Personal Project Note

This is a personal development project. Features follow KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles. Scope focuses on core functionality for a solo developer workflow.

---

## 1. Overview

**Goal:** Provide tools for agents to generate marketing artifacts (images, audio) programmatically using external services.

**Why:** Agents should be able to create visual and audio content without manual intervention.

**Priority:** Medium
**Timeline:** 3-4 weeks

---

## 2. Problem

- Agents can only work with text content
- No way to generate images programmatically
- No audio synthesis or transcription capabilities
- Cannot manage and track generated assets

---

## 3. Use Cases

1. **Agent generates marketing images:** Agent creates product images for listing
2. **Agent synthesizes narration:** Agent converts written content to audio
3. **Agent transcribes audio:** Agent converts audio to text for processing
4. **Agent tracks artifacts:** Agent queries previously generated assets to avoid duplication

---

## 4. Requirements

### Core Features

**FR1: Image Generation**
- Generate images from text prompts using external service (e.g., Nanobanana)
- Specify: prompt, style, resolution, format
- Return: image URL, metadata (size, resolution)
- Cache results to avoid regenerating same prompt

**FR2: Text-to-Speech (TTS)**
- Convert text to audio using external service
- Specify: text, voice type, language, speed
- Return: audio URL, duration
- Support multiple voice options
- Cache results to avoid regenerating same text

**FR3: Speech-to-Text (STT)**
- Transcribe audio files using external service
- Specify: audio URL, language
- Return: transcribed text, confidence score
- Support batch transcription with concurrency limits

**FR4: Artifact Storage & Tracking**
- Store artifact metadata in database (type, URL, source, agent ID, created timestamp)
- Query artifacts by agent, type, source, date range
- Delete artifacts
- Prevent duplicate generation through caching

### Agent-Facing Tools

```typescript
generateImage(prompt: string, options?: {style, resolution, format}): Promise<{url, metadata}>
synthesizeAudio(text: string, options?: {voice, language, speed}): Promise<{url, duration}>
transcribeAudio(audioUrl: string, language?: string): Promise<{text, confidence}>
listArtifacts(filters?: {agentId, type, source}): Promise<Artifact[]>
getArtifact(artifactId: string): Promise<Artifact>
deleteArtifact(artifactId: string): Promise<void>
```

---

## 5. Success Criteria

- Agents can generate images and audio without manual steps
- Image generation completes in <30 seconds
- Audio synthesis completes in <10 seconds
- Caching prevents duplicate API calls for identical requests
- All artifacts are tracked in database with proper metadata
- Agents cannot access artifacts from other agents (isolation)

---

## 6. Non-Functional Requirements

**Performance:**
- Image generation: <30 seconds
- Audio synthesis: <10 seconds
- Artifact lookup: <100ms

**Reliability:**
- Failed API calls don't crash agent
- Retry logic for transient failures
- Graceful error messages

**Security:**
- API credentials stored securely (encrypted in database)
- Agents can only access their own artifacts
- No credential leakage in logs or responses

---

## 7. Scope

### In Scope
- Image generation via external API
- Text-to-speech synthesis
- Speech-to-text transcription
- Artifact metadata storage
- Caching to prevent duplicate generation
- Basic cost tracking per artifact

### Out of Scope
- Video generation or hosting
- Advanced image editing or manipulation
- Custom voice training
- Real-time streaming
- Manual UI for artifact management
- Advanced analytics dashboard

---

## 8. Technical Approach

### Database Schema

**`forge_artifacts` table:**
```
- artifact_id (UUID, primary key)
- agent_id (UUID)
- type (ENUM: image, audio)
- source (ENUM: nanobanana, tts, stt)
- source_id (VARCHAR) -- external service ID
- url (VARCHAR) -- public access URL
- prompt (TEXT, nullable) -- for images
- input_text (TEXT, nullable) -- for TTS
- metadata (JSON) -- size, duration, resolution, etc
- created_at (TIMESTAMP)
- expires_at (TIMESTAMP, nullable)
- cost (DECIMAL, nullable)
```

**`forge_artifact_cache` table:**
```
- cache_id (UUID, primary key)
- hash (VARCHAR, unique) -- SHA256 of prompt/text
- artifact_id (UUID, foreign key)
- created_at (TIMESTAMP)
- expires_at (TIMESTAMP)
```

### Implementation Phases

**Phase 1: Setup & Image Generation (Week 1)**
1. Set up external service integrations (Nanobanana API)
2. Implement image generation tool
3. Build artifact storage layer
4. Add basic caching

**Phase 2: Audio Tools (Week 2)**
1. Implement TTS integration
2. Implement STT integration
3. Add voice selection
4. Add batch processing

**Phase 3: Refinement (Week 3-4)**
1. Error handling and retry logic
2. Cost tracking
3. Testing and documentation

---

## 9. External Services

- **Image Generation:** Nanobanana API (or alternative)
- **Text-to-Speech:** ElevenLabs, Google Cloud TTS, or AWS Polly
- **Speech-to-Text:** OpenAI Whisper, Google Cloud STT, or AWS Transcribe

All credentials stored in environment variables and encrypted in database.

---

## 10. Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| External API downtime | Graceful error handling, user notification |
| Cost overruns | Rate limiting, cost tracking, alerts |
| Poor quality outputs | Clear documentation on prompt best practices |
| Cache invalidation bugs | TTL-based expiration, manual clearing option |

---

## 11. Testing Strategy

- **Unit Tests:** Caching logic, artifact metadata handling
- **Integration Tests:** End-to-end generation, storage, retrieval
- **Error Handling:** API failures, timeout, invalid input

---

## Glossary

| Term | Definition |
|------|-----------|
| Artifact | Generated media (image, audio) with metadata |
| Cache | Storage of results to avoid regenerating identical requests |
| Source | External service that generated the artifact |
| Prompt | Text description for image generation |

---

**Next Steps:** Finalize external service selection and begin Phase 1
