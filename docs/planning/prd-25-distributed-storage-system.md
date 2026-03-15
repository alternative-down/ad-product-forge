# PRD 25: Distributed Storage System

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Version:** 1.0
**Note:** Personal project by solo developer. Scope limited to core functionality (KISS + YAGNI).

---

## Executive Summary

### Goal
Implement a simple file storage system using MinIO for agents and applications to persist files and artifacts.

### Core Features
1. **MinIO Integration** - Use MinIO as object storage backend
2. **File Upload/Download** - Basic file operations
3. **Agent Storage** - Agents can store and retrieve artifacts
4. **Metadata Tracking** - Track file information in database
5. **Simple Access Control** - Basic permissions (owner access)

### Out of Scope
- Backup/recovery systems
- Multi-region deployment
- Advanced encryption
- Versioning
- Quotas and billing
- Share links/public access
- Virus scanning
- Full-text search
- Compression

---

## Data Model

### Storage Configuration
```typescript
storage_configs {
  id: UUID
  application_type: 'agent' | 'application'
  application_id: UUID
  bucket_name: string
  access_level: 'private' (only)
  created_at: timestamp
  updated_at: timestamp
}
```

### File Metadata
```typescript
file_metadata {
  id: UUID
  config_id: UUID (foreign key)
  object_id: string (MinIO reference)
  file_name: string
  size_bytes: bigint
  content_type: string (optional)
  uploaded_at: timestamp
  uploaded_by: string (agent_id)
  access_count: integer (default 0)
}
```

---

## API Endpoints

### File Operations
- `POST /api/storage/upload` — Upload file
- `GET /api/storage/:object_id` — Download file
- `GET /api/storage/metadata/:object_id` — Get file metadata
- `DELETE /api/storage/:object_id` — Delete file
- `GET /api/storage/list` — List files (for agent)

### Agent Storage API (in agent context)
```typescript
agent.storage.uploadFile(filePath: string, content: Buffer): Promise<{
  objectId: string
  fileName: string
  sizeBytes: number
  uploadedAt: string
}>

agent.storage.downloadFile(objectId: string): Promise<Buffer>

agent.storage.deleteFile(objectId: string): Promise<void>

agent.storage.listFiles(): Promise<StoredFile[]>
```

---

## Implementation Notes

### MinIO Setup
- Deploy MinIO via Docker (docker-compose)
- Create buckets per agent or application
- Store MinIO credentials in environment variables
- Basic health checks

### Database
- Use existing Drizzle ORM + LibSQL
- Create tables: `storage_configs`, `file_metadata`
- Index on uploaded_by and created_at

### File Operations
- Use MinIO SDK for Node.js
- Simple in-memory buffering (no streaming initially)
- File size limit: 500MB per file
- Store uploaded_by for basic access control

### Access Control
- Simple owner-only access (agent can only access their files)
- Check uploaded_by on all downloads
- No sharing or public access (Phase 2)

### Error Handling
- Handle MinIO connection errors gracefully
- Return meaningful error messages
- Log all storage operations

### Testing
- Unit tests for upload/download
- MinIO integration tests (with test container)
- Access control tests

---

## Success Criteria
- Files can be uploaded to MinIO
- Files can be downloaded by owner
- File metadata stored and queryable
- Delete operations work
- Access control enforced (owner only)

---

## Dependencies
- MinIO SDK (`minio` npm package)
- Drizzle ORM (existing)
- LibSQL (existing)
- Docker (for MinIO deployment)

---

## Timeline
- **Week 1:** MinIO setup + Docker config
- **Week 2:** Database schema + file metadata
- **Week 3:** Upload/download endpoints
- **Week 4:** Agent integration + testing

Total: ~35 hours for solo developer

---

## Future Enhancements
- Share links with expiration
- Versioning support
- Quota enforcement
- Backup to external storage
- File preview generation

---

**Document History:**
- v1.0 (2026-03-15): Simplified for personal solo developer project
