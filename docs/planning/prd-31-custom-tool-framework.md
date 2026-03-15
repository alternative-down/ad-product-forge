# PRD-31: Custom Tool Framework

## 1. Executive Summary

**Feature Name:** Custom Tool Framework

**Objective:** Enable agents to autonomously create, configure, and deploy specialized tools tailored to their operational needs, allowing agents to extend their capabilities independently without requiring system-level modifications.

**Business Value:**
- Empowers agents with true autonomy to build specialized capabilities for their specific workflows
- Eliminates dependency on centralized tool development and deployment processes
- Enables rapid iteration and experimentation with new integrations and utilities
- Supports emergent specialization as agents evolve their operational strategies
- Creates foundation for agent-driven platform expansion and ecosystem growth

**Priority:** High (Critical for agent autonomy and platform extensibility)

**Timeline Estimate:** 5-7 weeks

---

## 2. Problem Statement

### Current State
- Tools are statically defined and provisioned at system initialization
- Agents have no mechanism to create or register new tools at runtime
- Tool creation requires human intervention and application restart
- Agents must work within pre-defined tool set regardless of operational requirements
- No standardized framework for agents to build custom integrations
- Tool sharing and discovery between agents is not supported

### Challenges
- Agents need secure method to create tools without full system access
- Custom tools must integrate with existing Skills system and tool execution infrastructure
- Security boundaries must prevent malicious or runaway tool definitions
- Custom tools need persistence and recovery mechanisms
- Tool versioning and updates must be manageable
- Discovery and documentation of custom tools must be automatic
- Tools created by agents must be safely executed within agent sandboxes

### Impact
- Agents cannot respond to emerging operational needs with new capabilities
- Platform becomes rigid and limits agent innovation
- Blocks use cases where specialized tools would improve efficiency
- Prevents agents from building domain-specific utilities for their functions
- Reduces platform value by not leveraging agent intelligence for tool creation

---

## 3. Target Users & Use Cases

### Primary Users
- Autonomous agents with permission to create tools
- Research agents building specialized data integration tools
- Development agents creating build/deployment automation tools
- Operations agents building operational utilities and monitoring tools
- Master agent setting up initial custom tool templates

### Use Cases

#### UC1: Research Agent Creates Data Integration Tool
As a research agent, I need to create a custom tool that integrates with a new data source so that I can fetch specialized research data required for analysis.

- Research agent analyzes operational needs
- Requests tool creation with API integration requirements
- System validates request against security policies
- Tool is created and tested in agent's environment
- Agent begins using tool in research workflows

#### UC2: Development Agent Creates Build Automation Tool
As a development agent, I need to create a custom tool that orchestrates our specific build pipeline so that I can automate deployment workflows.

- Development agent defines build steps and integration points
- Creates tool using Tool builder interface with custom logic
- Tool is registered and persisted
- Tool becomes available in agent's standard capabilities
- Team agents can discover and reuse the build automation tool

#### UC3: Operations Agent Builds Monitoring Integration
As an operations agent, I need to create a custom tool that integrates with our monitoring system so that I can monitor infrastructure health and trigger alerts.

- Operations agent defines monitoring requirements
- Creates tool that pulls metrics from monitoring API
- Tool includes alert thresholds and notification logic
- Tool is registered with discovery metadata
- Other operations agents discover and use the monitoring tool

#### UC4: Agent Tool Discovery and Reuse
As a specialist agent, I need to discover tools created by other agents in the system so that I can leverage existing capabilities rather than recreating them.

- Agent queries available custom tools
- System returns tools with descriptions, examples, and usage documentation
- Agent reuses existing tool in workflow
- Platform reduces duplication and improves efficiency

---

## 4. Requirements

### Functional Requirements

#### FR1: Custom Tool Creation
- Agents with tool creation permissions can create new tools via API/command
- Tool creation request must specify:
  - `toolName` — unique identifier within agent's namespace (e.g., "data_ingestion_v1")
  - `toolDisplayName` — human-readable name (e.g., "Data Ingestion Pipeline")
  - `toolDescription` — detailed description of tool purpose and behavior
  - `toolType` — classification: `integration`, `utility`, `automation`, `analysis`, `custom`
  - `implementation` — tool definition in one of supported formats (see FR2)
  - `requiredInputs` — schema of inputs/parameters tool accepts
  - `outputSchema` — schema of tool outputs/return values
  - `permissions` — list of required system permissions (if any)
  - `errorHandling` — strategy for error handling and recovery
  - `metadata` — tags, documentation links, version info

#### FR2: Multiple Tool Implementation Methods
- **Skills Integration:** Agents can create tools by wrapping existing registered Skills
  - Reference skill by ID/name
  - Define parameter mapping
  - Tool executes skill with provided parameters
  - Format: `{ type: "skill", skillId: "string", parameterMapping: {...} }`

- **Custom Function Definition:** Agents can define tool logic using a structured interface
  - Support JavaScript/TypeScript function definitions (restricted execution context)
  - Define function signature and implementation
  - System validates and sandboxes function execution
  - Format: `{ type: "function", implementation: "string", sandbox: "restricted" }`

- **HTTP Integration:** Agents can create tools that call external APIs
  - Define API endpoint, method, headers, authentication
  - Support templated requests with parameter substitution
  - Handle pagination and rate limiting
  - Format: `{ type: "http", endpoint: "string", method: "string", auth: {...} }`

- **Tool Builder Interface:** Visual/interactive tool creation for complex tools
  - Drag-and-drop workflow builder
  - Pre-built components for common operations
  - Parameter mapping and transformation
  - Conditional logic and branching
  - Format: `{ type: "workflow", definition: "object" }`

#### FR3: Tool Persistence & Registry
- Custom tools are stored in agent-specific tool registry database
- Registry location: per-agent database (same as communication/scheduling)
- Tool metadata includes:
  - Creation timestamp and creator agent ID
  - Last modified timestamp
  - Version number (auto-incremented on updates)
  - Deprecation status (if tool is superseded)
  - Usage count and last execution timestamp
  - Execution error logs and performance metrics

#### FR4: Tool Access Control & Validation
- Tool creation is restricted to agents with `tool:create` permission
- Agents can only create tools in their own namespace by default
- Optional sharing mechanism allows agents to grant access to other agents
- System validates:
  - Tool name uniqueness within agent namespace
  - Input/output schemas are valid and complete
  - Required permissions are valid system permissions
  - Function implementations contain no prohibited operations (filesystem access, network bypass, etc.)
  - HTTP integrations use allowed domains/endpoints

#### FR5: Tool Execution & Integration
- Custom tools integrate seamlessly with agent execution context
- Agents can call custom tools the same way as system tools:
  - Via tool call in LLM responses
  - Synchronously with timeout protection
  - With input validation against schema
  - With output transformation per tool definition

- Execution includes:
  - Parameter validation and transformation
  - Error handling per tool's error strategy
  - Timeout protection (default: 30 seconds)
  - Execution logging and metrics collection
  - Context isolation (tool cannot access other agent data)

#### FR6: Tool Versioning & Updates
- Agents can update custom tools while maintaining version history
- Version management:
  - Each tool change creates new version (auto-incremented)
  - Previous versions remain accessible for rollback
  - Agents can specify which version to use in tool calls
  - Default always points to latest stable version
  - Tool can be marked as deprecated to encourage migration

- Update process:
  - Agent submits updated tool definition
  - System validates new definition
  - New version created, previous marked as outdated
  - Agents referencing old version are notified

#### FR7: Tool Discovery & Documentation
- Agents can discover custom tools created by other agents (with appropriate permissions)
- Discovery API provides:
  - Search by tool name, type, creator
  - Filter by permissions and requirements
  - Browse by tag/category
  - Pagination support
  - Usage examples and documentation

- Tool documentation automatically generated from:
  - Tool metadata (name, description)
  - Input/output schemas
  - Example calls and responses
  - Error cases and handling
  - Performance metrics and reliability data

#### FR8: Tool Performance Monitoring
- System tracks execution metrics for all custom tools:
  - Call count (total, per time period)
  - Success/failure rates
  - Average execution time
  - Error distribution by type
  - Performance trends over time

- Agents can view analytics for their tools
- System can warn if tool performance degrades

#### FR9: Tool Security & Sandboxing
- Custom function implementations execute in restricted sandbox:
  - No filesystem access
  - No unchecked network access (only to pre-approved endpoints)
  - No process spawning
  - Limited environment variable access
  - Memory and CPU limits

- HTTP integrations restricted to:
  - Pre-approved domain list (or agent can request domain approval)
  - TLS/SSL only for sensitive operations
  - Rate limiting and abuse protection
  - Request logging and audit trail

- Skill integrations isolated:
  - Tool can only access skill's public API
  - No bypass of skill's own access controls

#### FR10: Tool Lifecycle Management
- Tools can be marked as:
  - `active` — currently in use and maintained
  - `deprecated` — functional but superseded, migration encouraged
  - `archived` — no longer in use, kept for historical reference
  - `disabled` — temporarily unavailable (creator action)

- Deprecated/disabled tools:
  - Cannot be called by new tool invocations
  - Existing workflows can continue using them (with warning)
  - Can be re-enabled by creator

- Tool cleanup:
  - Tools unused for 90+ days can be archived
  - Archived tools not loaded into memory
  - Can be permanently deleted by creator only

---

## 5. Success Criteria

- Agents can create and deploy custom tools without human intervention
- Custom tools execute with <100ms additional overhead vs. system tools
- Tool creation request is processed and available within 5 seconds
- Discovery mechanism returns relevant tools with proper documentation
- Tool execution is fully logged with error tracking and performance metrics
- No tool execution can access other agents' data or bypass security boundaries
- Tool schema validation prevents 95%+ of invalid tool definitions
- Agents can update tools while maintaining version history
- Custom tool system supports 50+ concurrent tool executions per agent without performance degradation

---

## 6. Non-Functional Requirements

### Performance
- Tool creation: <5 seconds from request to deployment
- Tool execution: <100ms overhead vs. direct skill execution
- Discovery query: <500ms for agent with 500+ custom tools in system
- Tool update: <2 seconds to propagate to all instances
- Memory footprint: <10MB per 100 custom tools

### Reliability
- Tool execution failure does not crash agent process
- Failed tool calls are logged and agent can retry/fallback
- Tool persistence survives agent restart with zero data loss
- Tool updates are atomic (no partial state)
- Concurrent tool creation by same agent is serialized safely

### Security
- Tool execution sandboxing prevents data exfiltration
- No tool can escalate agent permissions beyond its own scope
- All tool modifications logged with creator identity and timestamp
- Tool sharing respects agent permission boundaries
- HTTP integrations cannot be used to bypass security policies

### Maintainability
- Tool creation API is well-documented with examples
- Tool builder interface is intuitive and discoverable
- Tool monitoring provides clear visibility into health and performance
- Tool versioning makes debugging and rollback straightforward
- Tool documentation is auto-generated and complete

### Scalability
- System supports thousands of custom tools across agent fleet
- Discovery remains performant as tool count grows
- Execution system can handle spikes in tool usage
- Database queries for tool lookup are indexed and optimized

---

## 7. Scope

### In Scope
- Core tool creation framework with multiple implementation methods
- Tool persistence and version management
- Tool execution integration with agent execution context
- Tool discovery and documentation system
- Tool security sandboxing and access control
- Basic performance monitoring and metrics
- Tool lifecycle management (deprecation, archival)
- API/command interface for tool operations

### Out of Scope (Future Phases)
- Advanced AI-assisted tool generation (auto-generation from description)
- Marketplace for sharing tools across agent instances
- Tool composition (combining tools into higher-level abstractions)
- Complex workflow builder with visual interface (Phase 2)
- Distributed execution (tools running on external compute)
- Tool monetization or cost tracking
- Real-time collaboration on tool creation
- Advanced analytics dashboard with visualizations

---

## 8. Dependencies & Assumptions

### Dependencies
- **Skills System:** Must be able to reference and wrap existing Skills
- **Database:** Agent database must support tool registry tables (already exists with communication/scheduling)
- **Agent Execution Context:** Tools must integrate with agent LLM tool execution and context management
- **Permission System:** Must have `tool:create` permission defined in role/permission system
- **Communication Module:** Error notifications and tool updates may use communication system

### Assumptions
- Agents creating tools understand security implications and limitations
- Agents with tool creation permission are trustworthy (not running adversarial code)
- HTTP integrations will point to trusted external APIs
- Tool implementations will be relatively simple (not requiring heavy computation)
- Most agents will have less than 100 custom tools each
- Tool execution latency of <100ms is acceptable for most use cases
- Single-instance deployment (no need for distributed tool execution initially)
- SQLite/LibSQL is sufficient for tool registry (can scale to multi-instance later)

---

## 9. Technical Approach

### Architecture Overview

```
Agent Process
    ├── Tool Registry Service
    │   ├── Create/Update/Delete tools
    │   ├── Validate tool definitions
    │   ├── Manage tool versions
    │   └── Persist to agent database
    │
    ├── Tool Discovery Service
    │   ├── Search and filter tools
    │   ├── Generate documentation
    │   └── Track usage metrics
    │
    ├── Tool Execution Engine
    │   ├── Route tool calls to handlers
    │   ├── Execute with sandboxing
    │   ├── Collect metrics
    │   └── Handle errors
    │
    └── Tool Handler Implementations
        ├── Skill Wrapper Handler
        ├── Function Handler (sandboxed)
        ├── HTTP Handler
        └── Workflow Handler
```

### Implementation Strategy

#### Phase 1: Core Framework (Weeks 1-2)
1. Define tool data model and database schema
2. Implement tool creation and validation API
3. Build tool persistence layer in agent database
4. Integrate tool execution into agent tool calling flow
5. Implement basic security validation

#### Phase 2: Execution & Integration (Weeks 2-4)
1. Implement skill wrapper handler
2. Implement HTTP integration handler
3. Build sandboxed function execution environment
4. Implement error handling and timeout protection
5. Add execution logging and metrics

#### Phase 3: Discovery & Management (Weeks 4-6)
1. Implement tool discovery API and search
2. Auto-generate tool documentation
3. Build tool versioning and update mechanism
4. Implement tool lifecycle management
5. Add performance monitoring dashboard

#### Phase 4: Polish & Hardening (Weeks 6-7)
1. Security audit and hardening
2. Performance optimization
3. Documentation and examples
4. Testing and validation
5. Deployment and rollout

### Database Schema

**`forge_custom_tools` table:**
```
- tool_id (UUID, primary key)
- agent_id (UUID, foreign key to agent)
- tool_name (VARCHAR, unique per agent)
- tool_display_name (VARCHAR)
- tool_description (TEXT)
- tool_type (ENUM: integration, utility, automation, analysis, custom)
- current_version_id (UUID, foreign key to tool_versions)
- status (ENUM: active, deprecated, archived, disabled)
- created_at (TIMESTAMP)
- created_by_agent_id (UUID)
- updated_at (TIMESTAMP)
- metadata (JSON: tags, documentation_url, etc.)
```

**`forge_custom_tool_versions` table:**
```
- version_id (UUID, primary key)
- tool_id (UUID, foreign key)
- version_number (INTEGER, auto-increment per tool)
- implementation_type (ENUM: skill, function, http, workflow)
- implementation_config (JSON: type-specific configuration)
- required_inputs (JSON: input schema)
- output_schema (JSON: output schema)
- permissions_required (JSON array)
- error_handling_strategy (ENUM: retry, fallback, fail, manual)
- created_at (TIMESTAMP)
- created_by_agent_id (UUID)
- is_stable (BOOLEAN, default true on creation)
```

**`forge_custom_tool_executions` table:**
```
- execution_id (UUID, primary key)
- tool_id (UUID, foreign key)
- version_id (UUID, foreign key)
- agent_id (UUID, agent executing tool)
- started_at (TIMESTAMP)
- completed_at (TIMESTAMP)
- status (ENUM: success, failure, timeout, error)
- execution_time_ms (INTEGER)
- input_params (JSON)
- output_result (JSON, nullable)
- error_message (TEXT, nullable)
```

**`forge_custom_tool_shares` table:**
```
- share_id (UUID, primary key)
- tool_id (UUID, foreign key)
- tool_owner_agent_id (UUID)
- shared_with_agent_id (UUID)
- created_at (TIMESTAMP)
- expires_at (TIMESTAMP, nullable)
- permissions (ENUM: readonly, execute, modify)
```

### API Endpoints

#### Tool Management
- `POST /agent/tools` — Create new custom tool
- `GET /agent/tools/:toolId` — Get tool details and documentation
- `PUT /agent/tools/:toolId` — Update tool definition (creates new version)
- `DELETE /agent/tools/:toolId` — Delete tool
- `POST /agent/tools/:toolId/versions/:versionId/rollback` — Rollback to previous version
- `PATCH /agent/tools/:toolId/status` — Change tool status (active/deprecated/archived/disabled)

#### Tool Discovery
- `GET /agent/tools` — List tools (with filtering, search, pagination)
- `GET /agent/tools/shared` — List tools shared with agent
- `GET /agent/tools/discovery?q=:query&type=:type&tag=:tag` — Search and discover tools

#### Tool Sharing
- `POST /agent/tools/:toolId/share` — Share tool with another agent
- `DELETE /agent/tools/:toolId/shares/:shareId` — Revoke tool sharing
- `GET /agent/tools/:toolId/shares` — List agents tool is shared with

#### Tool Execution (integrated with tool calling)
- Tool calls executed through standard LLM tool execution flow
- Custom tools routed through custom tool execution engine
- Metrics tracked automatically

#### Analytics & Monitoring
- `GET /agent/tools/:toolId/metrics` — Get execution metrics for tool
- `GET /agent/tools/metrics/summary` — Summary metrics across all tools
- `GET /agent/tools/:toolId/executions` — Recent execution history

---

## 10. Risks & Mitigation

### Risk: Security Vulnerability in Custom Tool Code
**Severity:** High
**Impact:** Agent with compromised tool could affect system
**Mitigation:**
- All custom function code runs in restricted sandbox with no filesystem/network access
- Regular security audits of sandboxing implementation
- Rate limiting and resource limits on execution
- Detailed logging of all tool activities for forensic analysis

### Risk: Tool Creation Becomes Bottleneck
**Severity:** Medium
**Impact:** Agents unable to create tools when needed
**Mitigation:**
- Asynchronous tool creation with background processing
- Cache tool definitions in memory for fast access
- Database indexing for optimal query performance
- Load testing to ensure scalability

### Risk: Tool Dependency Hell
**Severity:** Medium
**Impact:** Tools depend on other custom tools, creating fragile chains
**Mitigation:**
- Clear guidance on tool design to minimize inter-tool dependencies
- Version pinning for tool-to-tool dependencies
- Deprecation warnings when tools depend on deprecated tools
- Tool composition limits in initial version

### Risk: Poor Tool Discovery Leads to Duplication
**Severity:** Low
**Impact:** Agents create duplicate tools unknowingly
**Mitigation:**
- Discovery API with good search and filtering
- Recommendations for similar existing tools during creation
- Usage metrics visible in discovery to guide tool reuse
- Documentation encourages tool reuse

### Risk: Tool Execution Performance Degrades
**Severity:** Medium
**Impact:** Tools too slow to be useful
**Mitigation:**
- Execution time metrics tracked and monitored
- Warnings if tool performance degrades >20%
- Timeout protection prevents runaway tools
- Performance testing guidelines for tool creation

### Risk: Agents Create Tools That Violate Policies
**Severity:** Medium
**Impact:** Tool created that violates security or business policies
**Mitigation:**
- Pre-validation of tool definitions against policy rules
- Permission checks on required capabilities
- Manual approval workflow for tools requiring sensitive permissions
- Regular audits of tool definitions

---

## 11. Metrics & Analytics

### Adoption Metrics
- Number of custom tools created per agent
- Number of agents with tool creation permission
- Percentage of agents creating at least one tool
- Tool creation success rate (% that pass validation)

### Usage Metrics
- Total custom tool executions per day
- Average executions per tool per day
- Tool discovery API calls and click-through rates
- Tool sharing acceptance rate

### Quality Metrics
- Tool execution success rate
- Average tool execution time
- Percentage of tools with execution errors
- Tool deprecation rate (how many tools become deprecated)

### Performance Metrics
- Tool creation latency (p50, p95, p99)
- Tool execution overhead vs. direct skill execution
- Discovery API response time
- Database query performance for tool lookups

### Adoption Goals (6 months)
- 60%+ of agents with tool creation permission actually create at least one tool
- Average 5+ custom tools per active agent
- 80%+ of new tools pass validation on first submission
- 70%+ of tool executions succeed without error

---

## 12. Testing Strategy

### Unit Tests
- Tool validation logic (schema validation, security checks)
- Tool execution routing and parameter mapping
- Sandbox execution isolation
- Version management and rollback logic
- Discovery filtering and search logic

### Integration Tests
- Tool creation end-to-end (creation → persistence → execution)
- Skill wrapper integration with actual Skills
- HTTP integration with mock APIs
- Tool sharing and access control
- Metrics collection and analytics

### Security Tests
- Sandbox escape attempts (filesystem, network, process access)
- Tool execution cannot access other agent data
- HTTP integrations cannot bypass domain restrictions
- Function code cannot import dangerous modules
- Concurrent execution doesn't leak state between tools

### Performance Tests
- Tool creation latency under load
- Tool execution throughput (concurrent executions)
- Discovery query performance with 1000+ tools
- Database performance with 100K+ executions
- Memory usage with large tool definitions

### User Acceptance Tests
- End-to-end workflow: agent creates tool → discovers similar → reuses existing
- Error scenarios: invalid schema, timeout, execution failure
- Tool updates and versioning workflow
- Discovery and documentation clarity

---

## 13. Success Metrics & Go-Live Criteria

### Pre-Launch Success Criteria
- [ ] Core tool creation and execution working end-to-end
- [ ] Tool security sandboxing validated by security team
- [ ] Skill wrapper handler working with 5+ real Skills
- [ ] HTTP integration handler working with test APIs
- [ ] Tool discovery returning relevant results
- [ ] Performance tests meet latency targets (<100ms overhead)
- [ ] Documentation complete with examples
- [ ] All high/critical security tests passing

### Go-Live Metrics
- **Successful deployments:** 0 tool creation errors in first 24 hours
- **Execution reliability:** 95%+ tool execution success rate
- **Latency:** Tool creation <5s, execution <100ms overhead
- **Discovery:** 80%+ of tool discovery queries return useful results
- **Adoption:** 50%+ of eligible agents create tool within first week

### Post-Launch Monitoring
- Monitor execution error rate and types
- Track slow tools (>100ms overhead)
- Monitor discovery usage and effectiveness
- Collect agent feedback on tool creation process
- Track tool deprecation and lifecycle transitions

### Success Criteria (3 months post-launch)
- 60%+ of eligible agents have created custom tools
- 5+ custom tools created per active agent on average
- 90%+ tool execution success rate
- Tool features used in 30%+ of agent workflows
- Zero critical security incidents related to custom tools
- Custom tools reduce human intervention for 20%+ of agent tasks

---

## Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Custom Tool** | A tool created by an agent to extend its capabilities beyond standard system tools |
| **Tool Type** | Classification of tool: integration (external API), utility (helper functions), automation (workflow execution), analysis (data processing), custom (other) |
| **Tool Version** | Immutable snapshot of tool definition; each update creates new version |
| **Tool Registry** | Database of custom tools owned and available to an agent |
| **Sandboxing** | Execution environment with restrictions preventing dangerous operations |
| **Tool Handler** | Module that executes specific type of tool (skill wrapper, function, HTTP, workflow) |
| **Tool Discovery** | Mechanism to search and find custom tools within system |
| **Tool Sharing** | Mechanism allowing agent to grant another agent access to its custom tools |
| **Skill Wrapper** | Custom tool implementation that wraps and calls an existing system Skill |
| **HTTP Integration** | Custom tool that calls external API endpoints |

---

## Appendix: Example Tool Definitions

### Example 1: Skill Wrapper Tool
```json
{
  "toolName": "slack_message_sender",
  "toolDisplayName": "Send Slack Message",
  "toolDescription": "Send messages to Slack channels using the Slack provider",
  "toolType": "integration",
  "implementation": {
    "type": "skill",
    "skillId": "slack-send-message",
    "parameterMapping": {
      "channel": "slackChannel",
      "message": "messageContent",
      "thread_ts": "threadTimestamp"
    }
  },
  "requiredInputs": {
    "type": "object",
    "properties": {
      "slackChannel": { "type": "string", "description": "Slack channel name or ID" },
      "messageContent": { "type": "string", "description": "Message to send" },
      "threadTimestamp": { "type": "string", "description": "Optional: reply in thread" }
    },
    "required": ["slackChannel", "messageContent"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "messageId": { "type": "string" },
      "timestamp": { "type": "string" }
    }
  }
}
```

### Example 2: HTTP Integration Tool
```json
{
  "toolName": "weather_lookup",
  "toolDisplayName": "Get Weather Data",
  "toolDescription": "Fetch current weather for a location using OpenWeather API",
  "toolType": "integration",
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
      "location": { "type": "string", "description": "City name or coordinates" }
    },
    "required": ["location"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "temperature": { "type": "number" },
      "humidity": { "type": "number" },
      "description": { "type": "string" }
    }
  }
}
```

### Example 3: Custom Function Tool
```json
{
  "toolName": "text_analysis",
  "toolDisplayName": "Analyze Text Sentiment",
  "toolDescription": "Analyze sentiment and extract key entities from text",
  "toolType": "analysis",
  "implementation": {
    "type": "function",
    "implementation": "module.exports = (text) => { const positive = (text.match(/good|great|excellent/gi) || []).length; const negative = (text.match(/bad|poor|terrible/gi) || []).length; return { sentiment: positive > negative ? 'positive' : negative > positive ? 'negative' : 'neutral', score: (positive - negative) / (positive + negative || 1) }; }",
    "sandbox": "restricted"
  },
  "requiredInputs": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "Text to analyze" }
    },
    "required": ["text"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "sentiment": { "type": "string", "enum": ["positive", "negative", "neutral"] },
      "score": { "type": "number", "minimum": -1, "maximum": 1 }
    }
  }
}
```
