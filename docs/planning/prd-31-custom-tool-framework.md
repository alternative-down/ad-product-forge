# PRD-31: Custom Tool Framework

**Status:** Planning
**Date:** 2026-03-15
**Version:** 1.0

---

## Personal Project Note

This is a personal development project. Features follow KISS (Keep It Simple, Stupid) and YAGNI (You Aren't Gonna Need It) principles. Scope focuses on core functionality for a solo developer workflow.

---

## 1. Overview

**Goal:** Allow agents to create and use custom tools dynamically without restarting the application.

**Why:** Agents should be able to extend their capabilities at runtime by wrapping Skills or defining simple HTTP integrations.

**Priority:** High
**Timeline:** 3-4 weeks

---

## 2. Problem

- Tools are static (defined at startup)
- Agents can't create new tools when needed
- Adding a new tool requires code changes and restart
- No mechanism for agents to share tools with each other

---

## 3. Use Cases

1. **Agent wraps a Skill:** Research agent creates a tool that calls a Skill to fetch data
2. **Agent defines HTTP integration:** Agent creates a tool for a simple API endpoint
3. **Agent discovers tools:** Agent finds and reuses tools created by other agents

---

## 4. Requirements

### Core Features

**FR1: Tool Creation**
- Agents can create custom tools with name, description, and implementation
- Tool creation specifies: name, description, type, implementation details
- System validates tool definitions before saving

**FR2: Tool Implementation Methods**
- **Skills wrapper:** Reference an existing Skill by ID
- **HTTP integration:** Call an external API endpoint
- Sandboxed function execution (optional, Phase 2)

**FR3: Tool Storage & Persistence**
- Custom tools stored in agent database (one table per agent type)
- Tools persist across agent restarts
- Tools include metadata: creation timestamp, creator, version number

**FR4: Tool Access & Execution**
- Agents can call custom tools like system tools
- Tools execute with timeout protection (30 second default)
- Tool execution is logged
- Input validation against tool schema
- Context isolation (no access to other agent data)

**FR5: Tool Discovery**
- Agents can search for tools by name or type
- Discovery returns tool metadata and usage examples
- Tools are documented automatically from metadata

**FR6: Tool Versioning**
- Each tool update creates a new version
- Agents can specify which version to use
- Default always uses latest stable version
- Can mark tools as deprecated

---

## 5. Success Criteria

- Agents can create, persist, and use custom tools
- Tool creation takes <5 seconds
- Custom tool execution has <50ms overhead vs. system tools
- Tool execution is fully logged
- Agents cannot access other agents' data through tools
- Tool schema validation prevents 90%+ invalid definitions

---

## 6. Non-Functional Requirements

**Performance:**
- Tool creation: <5 seconds
- Tool execution: <50ms overhead
- Discovery query: <500ms for 100+ tools

**Reliability:**
- Tool execution failure doesn't crash agent
- Failed calls are logged; agent can retry
- Tool persistence survives agent restart (zero data loss)

**Security:**
- Tool execution sandboxing prevents data exfiltration
- No tool can exceed agent's own permissions
- All modifications logged with timestamp and creator
- HTTP integrations restricted to pre-approved domains

---

## 7. Scope

### In Scope
- Tool creation and validation
- Skill wrapper implementation
- HTTP integration implementation
- Tool persistence and versioning
- Tool execution with logging
- Basic tool discovery
- Auto-generated documentation

### Out of Scope (Future)
- Visual tool builder UI
- Tool marketplace or sharing infrastructure
- Tool composition (combining tools)
- Distributed execution
- Advanced analytics dashboard

---

## 8. Dependencies

- **Skills System:** Must reference existing Skills
- **Agent Database:** Must support tool tables
- **Agent Execution:** Tools must integrate with tool calling
- **Permission System:** Needs `tool:create` permission

---

## 9. Technical Approach

### Database Schema

**`forge_custom_tools` table:**
```
- tool_id (UUID, primary key)
- agent_id (UUID)
- tool_name (VARCHAR, unique per agent)
- tool_display_name (VARCHAR)
- tool_description (TEXT)
- tool_type (ENUM: skill, http, custom)
- current_version_id (UUID)
- status (ENUM: active, deprecated, archived)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- metadata (JSON)
```

**`forge_custom_tool_versions` table:**
```
- version_id (UUID, primary key)
- tool_id (UUID)
- version_number (INTEGER)
- implementation_type (ENUM: skill, http)
- implementation_config (JSON)
- required_inputs (JSON schema)
- output_schema (JSON schema)
- created_at (TIMESTAMP)
```

### Implementation Phases

**Phase 1: Core Framework (Week 1)**
1. Define tool data model
2. Implement tool creation API
3. Build persistence layer
4. Integrate tool execution

**Phase 2: Implementation Methods (Week 1-2)**
1. Skill wrapper handler
2. HTTP integration handler
3. Error handling and timeout protection

**Phase 3: Discovery & Management (Week 2-3)**
1. Tool discovery API
2. Auto-generate documentation
3. Versioning and lifecycle management

**Phase 4: Testing & Polish (Week 3-4)**
1. Security audit
2. Performance optimization
3. Documentation

---

## 10. Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Security issues in custom tools | Sandbox execution, rate limits, logging |
| Tool performance degrades | Monitor execution time, alert on regression |
| Tool dependency hell | Encourage loose coupling, version pinning |
| Poor tool discovery | Clear search, usage metrics visible |

---

## 11. Metrics

**Adoption:**
- Number of custom tools created per agent
- Tools created successfully on first attempt (%)

**Quality:**
- Tool execution success rate
- Average tool execution time

**Usage:**
- Custom tool executions per day
- Tool discovery API calls

---

## 12. Testing Strategy

- **Unit Tests:** Validation logic, routing, versioning
- **Integration Tests:** End-to-end creation, execution, discovery
- **Security Tests:** Sandbox isolation, permission checks, HTTP domain restrictions
- **Performance Tests:** Creation latency, execution throughput

---

## Glossary

| Term | Definition |
|------|-----------|
| Custom Tool | Tool created by agent to extend capabilities |
| Tool Type | Classification: skill (wrapper), http (API), custom (other) |
| Tool Version | Immutable snapshot of tool definition |
| Skill Wrapper | Custom tool that wraps existing Skill |
| Tool Discovery | Search and find custom tools in system |

---

## Example Tool Definitions

### Skill Wrapper Tool
```json
{
  "toolName": "send_slack_message",
  "toolDisplayName": "Send Slack Message",
  "toolDescription": "Send messages to Slack channels",
  "toolType": "skill",
  "implementation": {
    "type": "skill",
    "skillId": "slack-send-message",
    "parameterMapping": {
      "channel": "slackChannel",
      "message": "messageContent"
    }
  },
  "requiredInputs": {
    "type": "object",
    "properties": {
      "slackChannel": { "type": "string" },
      "messageContent": { "type": "string" }
    },
    "required": ["slackChannel", "messageContent"]
  }
}
```

### HTTP Integration Tool
```json
{
  "toolName": "weather_lookup",
  "toolDisplayName": "Get Weather",
  "toolDescription": "Fetch current weather for a location",
  "toolType": "http",
  "implementation": {
    "type": "http",
    "endpoint": "https://api.openweathermap.org/data/2.5/weather",
    "method": "GET",
    "auth": {
      "type": "apikey",
      "headerName": "appid",
      "credentialName": "openweather_api_key"
    },
    "queryParams": {
      "q": "{location}",
      "units": "metric"
    }
  },
  "requiredInputs": {
    "type": "object",
    "properties": {
      "location": { "type": "string" }
    },
    "required": ["location"]
  }
}
```

---

**Next Steps:** Feasibility review and architecture decision
