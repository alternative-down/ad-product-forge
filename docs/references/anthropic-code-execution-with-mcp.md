# Reference: Anthropic - Code execution with MCP

Source:
- https://www.anthropic.com/engineering/code-execution-with-mcp
- Title: `Code execution with MCP: Building more efficient agents`
- Published: 2025-11-04

## Why this matters

The core argument is simple:
- direct tool calling does not scale well when an agent has access to many tools
- the model pays context cost twice:
  - once for loading tool definitions
  - again for carrying intermediate tool results through the model loop

Their proposal is not "more tools".
It is:
- use MCP as the connectivity layer
- use code execution as the orchestration layer
- let the model write code that calls MCP-backed APIs from inside a sandboxed runtime

This changes the agent from:
- `model -> tool call -> result in context -> next tool call`

to:
- `model writes code -> code runs inside sandbox -> code calls MCP tools directly -> model only sees the outputs that matter`

## Core idea

Instead of exposing every MCP tool directly as a callable tool in the model loop, expose MCP capabilities as code-level APIs.

Typical shape:
- one directory per server
- one file per tool
- thin typed wrappers over MCP calls
- agent discovers tools by reading the filesystem or by searching available tool definitions

So the model does not need every tool schema upfront.
It can:
- discover available servers
- inspect only the relevant wrappers
- write code that composes those APIs

This is progressive disclosure for tools.

## Problem being solved

### 1. Tool definitions overload context

If an agent has hundreds or thousands of tools, loading all definitions into context is expensive and slows everything down.

The main point is:
- context gets crowded before the actual task even starts

### 2. Intermediate tool results overload context

Without code execution, large payloads pass through the model repeatedly.

Examples:
- long documents
- big spreadsheets
- complex objects
- data moved between two systems

The model becomes an unnecessary transport layer.

## What code execution changes

### Progressive disclosure

The model loads only the tool wrappers it needs for the current task.

Practical effect:
- lower token cost
- lower latency
- better focus

### Context-efficient intermediate processing

Large results can be:
- filtered
- mapped
- reduced
- joined
- summarized

inside the execution environment before anything goes back to the model.

The model sees:
- the subset that matters
- not the full raw payload

### Better control flow

Code can express:
- loops
- conditionals
- retries
- polling
- batching
- error handling

without forcing the model to re-enter the loop for every step.

This is a real architectural benefit, not just a token optimization.

### Privacy-preserving data flow

The execution environment can keep intermediate data out of model context.

They also discuss tokenizing sensitive data inside the MCP client boundary so that:
- the real values flow system-to-system
- the model only sees placeholders

This is a strong idea for deterministic data-flow control.

### State persistence and reusable skills

Once code execution and filesystem access exist, the agent can:
- persist intermediate state
- save reusable scripts/functions
- evolve repeatable higher-level capabilities

This naturally connects to the concept of skills.

## Important tradeoff

Anthropic is explicit that this is not free.

Code execution adds operational burden:
- sandboxing
- resource limits
- monitoring
- execution isolation
- security review
- runtime lifecycle management

So the trade is:
- less context cost and better composition
- more infrastructure complexity

## The actual conceptual shift

The key shift is this:
- tools are no longer the primary interaction primitive for the model
- code becomes the primary interaction primitive
- MCP remains the standard transport/integration layer underneath

That means:
- the model is best used for planning, selecting, composing, and evaluating
- the runtime is best used for executing procedures and transforming data

This is much closer to how a strong engineer actually works.

## What is most relevant for Forge

This article is directly relevant to our current direction because Forge already has:
- many custom tools
- a growing operational surface
- role-based tool filtering
- a sandboxed execution path
- agents that already use shell/code to do real work

The takeaway is not "replace all tools with MCP".
The real takeaway is:
- keep MCP/tool connectivity at the boundary
- move more orchestration and data transformation into execution environments
- avoid making the model the transport layer for intermediate data

## Practical implications for our discussions

### 1. Tool count should not keep growing blindly

If the runtime can expose code-accessible capability surfaces, we should prefer:
- fewer, clearer operational primitives
- more composition in code

not:
- endless atomized tool expansion

### 2. MCP is more powerful when paired with code execution

By itself, MCP standardizes integration.
With code execution, it also becomes scalable.

### 3. Search and progressive disclosure matter

Their point about loading tool definitions on demand aligns with our use of:
- `ToolSearchProcessor`

That is the same family of idea:
- reveal less upfront
- load only what is needed

### 4. Data-sensitive flows should be designed around runtime boundaries

If we later deal with:
- payments
- customer data
- support logs
- analytics
- private documents

the correct question is not just:
- "what tool should the agent call?"

It is also:
- "what data must never pass through the model context?"

### 5. Skills and saved code become more important over time

If agents repeatedly solve the same operational patterns, the right direction is:
- save code
- save instructions
- reuse those higher-level capabilities

not repeatedly forcing the model to rediscover the same workflow.

## What we should not cargo-cult from this article

We should not read this as:
- every tool must become a generated file wrapper
- every workflow should be code-first immediately
- direct tools are obsolete

That would be shallow imitation.

The durable idea is:
- use the model for reasoning
- use code for execution and transformation
- keep interfaces progressively discoverable
- keep sensitive and bulky intermediate data out of the model when possible

## Bottom line

The article's strongest idea is:
- **MCP scales much better when the model writes code against capability surfaces instead of directly orchestrating every tool call in-context**

In one sentence:
- **turn the model into a planner/composer, not into a relay for every schema and payload**

## Forge note: current sandbox and CLI-in-environment idea

This was discussed separately from the Anthropic article, but it is relevant as a local architectural note.

### Current Forge reality

Forge currently creates agent workspaces with Mastra `LocalSandbox`.

Today, Forge only persists and passes:
- `workingDirectory`

Current code path:
- `apps/forge/src/agents/create-forge-agent.ts`
- `apps/forge/src/database/schema.ts`

### Important technical point

Mastra `LocalSandbox` supports more than what Forge currently models.

Its options include:
- `workingDirectory`
- `env`
- `timeout`
- `isolation`
- `nativeSandbox`

So the execution environment can technically be enriched with custom environment variables and a custom `PATH`.

### CLI conclusion for Forge

Yes, a CLI can be incorporated into the agent sandbox environment.

The correct interpretation is:
- not prompt context
- not model context
- execution environment context

That means:
- available binaries
- `PATH`
- environment variables
- working directory

### Practical ways this could work later

1. Executable file inside the agent workspace
- example: `workspace/bin/my-cli`
- callable by explicit path

2. Sandbox `PATH` enrichment
- add a workspace `bin/` directory
- prepend that directory to sandbox `PATH`
- the agent can call the CLI by name

3. Shared host-level CLI
- possible, but less desirable
- mixes global machine setup with agent runtime

### Recommended direction if we return to this later

If Forge needs CLI-aware sandbox environments later, the clean direction is:
- expand `workspaceSandbox` config
- allow something like:
  - `env?: Record<string, string>`
  - `pathEntries?: string[]`
- resolve relative paths against the agent workspace
- build final sandbox `PATH` explicitly at runtime

This keeps the behavior explicit and local to the agent runtime.
