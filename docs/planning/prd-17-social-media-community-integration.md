# PRD-17: Social Media & Community Integration (Simplified)

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Note:** Personal developer project. Apply KISS + YAGNI principles.

---

## 1. Summary

### Objective
Enable agents to publish content on social media (optional, for future use).

### Value
- Agents can share work on Twitter/LinkedIn
- Simple webhook-based publishing
- No real-time monitoring

### Note
This feature is **optional** and deprioritized for initial release.

---

## 2. Scope

### Included (if implemented)
- Publish content to Twitter via API
- Publish content to LinkedIn via API
- Store posting history

### Not Included
- Mention monitoring
- Feed monitoring
- Opportunity detection
- Scheduling
- Sentiment analysis
- Multiple platforms (just Twitter + LinkedIn)
- UI dashboard
- Analytics

---

## 3. Minimal Requirements

### RF-1: publishToTwitter Tool
```typescript
interface PublishToTwitterParams {
  content: string; // max 280 chars
}

// Returns: { postId: string, url: string } | { error: string }
```

### RF-2: publishToLinkedIn Tool
```typescript
interface PublishToLinkedInParams {
  content: string;
  title?: string;
}

// Returns: { postId: string, url: string } | { error: string }
```

### RF-3: Store API Credentials
- Twitter API key, API secret
- LinkedIn access token
- Via provider_configurations (PRD-02)

---

## 4. Implementation

### Phase 1: Twitter Integration (2-3h)
- Use `twitter-api-v2` npm package
- Implement `publishToTwitter()` tool
- Basic error handling

### Phase 2: LinkedIn Integration (2-3h)
- Use LinkedIn API
- Implement `publishToLinkedIn()` tool
- Basic error handling

---

## 5. Success Criteria
- [ ] Agent can post to Twitter
- [ ] Agent can post to LinkedIn
- [ ] Posts stored in log
- [ ] API credentials secured

---

## 6. Status
**Deferred** - Implement only if time permits. Not critical for MVP.

---

## 7. Effort
- Phase 1 & 2: ~8-10 hours (if implemented)

---

**End of document**
