# PRD 25: Distributed Storage System

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Version:** 1.0
**Note:** Personal project by solo developer. Scope limited to core functionality (KISS + YAGNI).

---

## Executive Summary

### Classification: AD-PRODUCT-FORGE APPLICATION

**This PRD describes file storage infrastructure specific to ad-product-forge.** Storage system enables Nicolas' agents to persist generated artifacts (code, documents, reports). This is application-specific, not framework infrastructure.

### Goal
Implement a simple local file storage system for agents to persist artifacts and files.

### Core Features
1. **Local Storage** - Store files on local filesystem
2. **File Upload/Download** - Basic file operations
3. **Agent Storage** - Agents can store and retrieve artifacts
4. **Metadata Tracking** - Track file paths and info in database

### Out of Scope
- Backup/recovery systems
- Cloud storage integration
- Advanced encryption
- Versioning
- Share links/public access
- Virus scanning
- Full-text search

---

## Data Model

### File Metadata
```typescript
file_metadata {
  id: UUID
  file_path: string (relative to storage dir)
  file_name: string
  size_bytes: bigint
  content_type: string (optional)
  uploaded_at: timestamp
  uploaded_by: string (agent_id)
}
```

---

## API Endpoints

### File Operations
- `POST /api/storage/upload` — Upload file
- `GET /api/storage/:file_id` — Download file
- `GET /api/storage/metadata/:file_id` — Get file metadata
- `DELETE /api/storage/:file_id` — Delete file
- `GET /api/storage/list` — List files for agent

### Agent Storage API (in agent context)
```typescript
agent.storage.uploadFile(fileName: string, content: Buffer): Promise<{
  fileId: string
  fileName: string
  sizeBytes: number
}>

agent.storage.downloadFile(fileId: string): Promise<Buffer>

agent.storage.deleteFile(fileId: string): Promise<void>

agent.storage.listFiles(): Promise<FileInfo[]>
```

---

## Implementation Notes

### Local Storage Setup
- Store files in a local directory (e.g., `./storage/files/`)
- Organize by agent_id subdirectories
- Create directory if missing on startup

### Database
- Use existing Drizzle ORM + LibSQL
- Create table: `file_metadata`
- Index on uploaded_by and file_path

### File Operations
- Use Node.js fs module for file I/O
- Simple file operations (read/write)
- File size limit: 500MB per file
- Store uploaded_by for basic access control

### Access Control
- Simple owner-only access (agent can only access their files)
- Check uploaded_by on all downloads

### Error Handling
- Handle file I/O errors gracefully
- Return meaningful error messages
- Log storage operations

### Testing
- Unit tests for upload/download
- MinIO integration tests (with test container)
- Access control tests

---

## Success Criteria
- Files can be uploaded to local storage
- Files can be downloaded by owner
- File metadata stored and queryable
- Delete operations work
- Access control enforced (owner only)

---

## Dependencies
- Drizzle ORM (existing)
- LibSQL (existing)
- Node.js fs module (built-in)

---

## Timeline
- **Week 1:** Database schema + file operations
- **Week 2:** Upload/download endpoints
- **Week 3:** Agent integration + testing

Total: ~20 hours for solo developer

---

## Future Enhancements
- Cloud storage integration (AWS S3, etc.)
- Versioning support
- Backup to external storage
- File preview generation

---

**Document History:**
- v1.0 (2026-03-15): Simplified for personal solo developer project
