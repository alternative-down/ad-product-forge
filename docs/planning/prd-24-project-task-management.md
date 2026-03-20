# PRD-24: Linear Agent Integration

**Status:** Planned
**Classification:** FORGE APP

## 1. Goal

Integrate Forge with **Linear** so internal agents can manage work directly inside Linear using:
- Linear's hosted **MCP server**
- one **Linear agent app** per Forge agent
- Linear webhook events for notifications and wake

This PRD is about:
- Linear as the external task/project/ticket system
- agent identity inside Linear
- MCP access to Linear objects
- Linear webhooks feeding `agent_notifications`

This PRD is not about:
- creating a local project/task system in Forge
- mirroring Linear issues/projects into Forge tables
- building custom issue/project CRUD wrappers when MCP already provides them

## 2. Core Direction

The first version stays small:
- one Linear workspace
- one Linear team
- one Linear agent app per Forge agent
- agents use Linear directly through the hosted MCP server
- Forge only stores the integration credentials needed for each agent

Linear remains the source of truth for:
- issues
- projects
- comments
- agent sessions

Forge remains responsible for:
- provisioning the per-agent integration state
- receiving webhooks
- creating notifications
- waking the agent runtime

## 3. Workspace Assumption

The first version assumes:
- one Linear workspace
- one team only

This avoids local routing complexity and avoids introducing any local mapping tables for teams or projects.

## 4. Identity Model

Each Forge agent should also exist as its own **Linear agent**.

The model is:
- one Forge agent
- one Linear OAuth application
- installed with `actor=app`
- acting as that app user inside the Linear workspace

This keeps the identity boundary clean:
- GitHub identity belongs to the GitHub App
- Linear identity belongs to the Linear app user

## 5. Credential Boundary

Linear credentials for one agent should live in encrypted `agent_providers` storage.

Suggested provider type:
- `linear-agent`

Suggested stored values:
- `clientId`
- `clientSecret`
- `accessToken`
- `refreshToken` if issued
- `viewerId`
- `webhookSecret`

These credentials:
- are not communication `accounts`
- are not exposed directly to agents
- are runtime integration credentials for the Linear adapter

## 6. Provisioning Direction

The first version should assume that the Linear OAuth application itself is created manually.

Reason:
- the public Linear docs describe creating a new Application in settings
- no public provisioning API was selected here for creating OAuth applications themselves

So the initial provisioning flow is:
1. create Forge agent
2. create corresponding Linear application manually
3. install it in the workspace with `actor=app`
4. store the resulting credentials in Forge
5. start the Linear integration for that agent

This keeps the implementation grounded in the official surface that is already documented.

## 7. MCP Direction

Forge should use **Linear's hosted remote MCP server**:
- `https://mcp.linear.app/mcp`

Authentication should use:
- `Authorization: Bearer <token>`

That token can represent:
- an app user token
- a normal OAuth token
- an API key

For this PRD, the intended mode is:
- **app user token for the agent**

The goal is to expose Linear's own MCP tools to the agent instead of building a parallel custom tool surface in Forge.

Implementation note:
- if Forge still lacks remote MCP client wiring, that wiring should be added first
- the fallback should not be a large custom CRUD layer
- if a temporary fallback is ever needed, it should stay thin and only cover the minimum gap until MCP wiring exists

## 8. Webhook Direction

Each Linear agent app should point to an adapter-specific webhook endpoint in Forge.

Initial route direction:
- `POST /webhooks/linear/{agentId}`

This keeps the routing explicit and consistent with the one-app-per-agent model.

Relevant webhook categories:
- Agent session events
- Inbox notifications
- Permission changes

The Linear webhook receiver should:
1. verify signature from the raw request body
2. verify freshness using `webhookTimestamp`
3. persist a compact notification in `agent_notifications`
4. trigger `wakeQueue`
5. return quickly

## 9. Notification Direction

Linear webhook events should not become communication messages.

They should become generic `agent_notifications` entries, similar to the GitHub integration pattern.

The notification content should be compact and provider-shaped enough to be useful, for example:
- `source: 'linear'`
- `event`
- `action`
- `type`
- `url`
- `summary`
- compact payload when needed

## 10. Agent Session Direction

The most important Linear-native flow is the **Agent Session** lifecycle.

When a user:
- mentions the agent
- delegates an issue to the agent
- continues an existing session

Linear sends an `AgentSessionEvent` webhook to that agent.

Forge should turn this into:
- notification
- wake
- then the agent continues by operating through MCP and/or Linear Agent Activities

## 11. Scope Constraints

Important constraint from Linear:
- `actor=app` integrations cannot also request `admin` scope

This means:
- the per-agent Linear identity should stay focused on agent work
- admin-level workspace automation should not be mixed into this same credential

That is acceptable for the first version because:
- we are not trying to automate workspace administration here
- we only need the agent to operate in Linear as an agent

## 12. Design Rules

- no local issue/project mirror tables
- no custom CRUD tool layer when MCP already provides the surface
- one Forge agent maps to one Linear agent app
- one team only in the first version
- webhook handling stays adapter-specific
- webhook events become `agent_notifications`
- agent wake happens from webhook intake

## 13. Success Criteria

- each Forge agent can be connected to its own Linear agent identity
- the agent can use Linear through the hosted MCP server
- the agent can work on issues/projects/comments without local Forge mirrors
- Agent Session webhooks reach Forge
- relevant webhook events create notifications and wake the agent
- no extra project/task schema is introduced in Forge
