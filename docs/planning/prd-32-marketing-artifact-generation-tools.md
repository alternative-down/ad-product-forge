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
**Timeline:** 2-3 weeks

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
- Query artifacts by agent and type
- Delete artifacts
- Simple caching to prevent duplicate generation

### Agent-Facing Tools

```typescript
generateImage(prompt: string, options?: {style, resolution}): Promise<{url, metadata}>
synthesizeAudio(text: string, options?: {voice, language}): Promise<{url, duration}>
transcribeAudio(audioUrl: string, language?: string): Promise<{text}>
listArtifacts(filters?: {agentId, type}): Promise<Artifact[]>
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
- Artifact lookup: fast enough for one developer

**Reliability:**
- Failed API calls don't crash agent
- Basic retry logic for transient failures
- Clear error messages

**Security:**
- API credentials stored in environment variables
- No credential leakage in logs

---

## 7. Scope

### In Scope
- Image generation via external API
- Text-to-speech synthesis
- Speech-to-text transcription
- Artifact metadata storage
- Simple caching to prevent duplicate generation

### Out of Scope
- Video generation or hosting
- Advanced image editing
- Custom voice training
- Real-time streaming
- Cost tracking/billing
- Advanced analytics

---

## 8. Technical Approach

### Database Schema

**`forge_artifacts` table:**
```
- artifact_id (UUID, primary key)
- agent_id (UUID)
- type (ENUM: image, audio)
- source (ENUM: nanobanana, tts, stt)
- url (VARCHAR) -- public access URL
- prompt (TEXT, nullable) -- for images
- input_text (TEXT, nullable) -- for TTS
- metadata (JSON) -- size, duration, resolution
- created_at (TIMESTAMP)
```

### Implementation Phases

**Phase 1: Core Implementation (2-3 weeks)**
1. Set up external service integrations
2. Implement image generation tool
3. Implement TTS integration
4. Implement STT integration
5. Build artifact storage layer
6. Error handling and logging
7. Basic testing

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
| External API downtime | Graceful error handling, clear error messages |
| Failed generation | Retry logic, fallback to error response |
| API quota exceeded | Monitor usage, adjust as needed |

---

## 11. Testing Strategy

- **Unit Tests:** Basic functionality, validation
- **Integration Tests:** End-to-end generation, storage, retrieval
- **Error Handling:** API failures, invalid input

---

## Glossary

| Term | Definition |
|------|-----------|
| Artifact | Generated media (image, audio) with metadata |
| Source | External service that generated the artifact |
| Prompt | Text description for image generation |

---

**Next Steps:** Begin Phase 1 implementation
