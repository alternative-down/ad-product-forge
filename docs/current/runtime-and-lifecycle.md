# Runtime and Lifecycle

## Agent loading

Agent loading is centralized in [agent-loader.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-loader.ts).

The loader currently:

1. reads the agent row from the central database
2. requires `functionId`
3. loads encrypted provider credentials from `agent_providers`
4. decrypts communication provider credentials
5. resolves capability grants
6. builds only the custom tools allowed for the agent role
7. filters workflows allowed for the agent role
8. creates the internal runtime

This is the single runtime construction path. Hiring uses this same loader after persistence.

## Hiring

Hiring orchestration is split across:

- [internal-agent-lifecycle.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/internal-agent-lifecycle.ts)
- [hire-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/hire-agent.ts)
- [internal-agents.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/workflows/internal-agents.ts)

Current hiring flow:

1. create or resolve the requested function
2. generate instructions through the hiring RH flow
3. provision the agent mailbox in Migadu
4. insert the agent row
5. insert the first weekly execution contract
6. insert encrypted provider credentials
   - internal chat
   - email
   - additional providers when present
7. create the internal heartbeat schedule
8. load the agent through the standard loader
9. add the runtime to the registry
10. create the GitHub App registration for the new agent

If GitHub App creation fails after the agent is created, the system terminates the newly created agent and rolls back operationally.

## Termination

Termination currently lives in [terminate-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/terminate-agent.ts).

Current termination flow:

1. remove the agent from the runtime registry
2. remove in-memory schedules for that agent
3. delete the agent mailbox in Migadu
4. delete the agent GitHub App installation and local registration state
5. delete the agent row from the central database
6. delete the agent workspace directory

Because agent-owned rows use cascading foreign keys, deleting the agent also removes:

- provider credentials
- contracts and execution steps
- notifications
- schedules

## Wake sources

The current system can wake an idle agent from multiple sources:

- inbound communication provider message
- GitHub webhook event
- scheduled wake trigger
- heartbeat trigger

All of these converge on the agent runner through `notifyExternalEvent`.

## Schedules and heartbeat

Schedules are owned by [schedules/manager.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/schedules/manager.ts) and persisted in `agent_schedules`.

Current behavior:

- schedules use `node-schedule`
- user-created schedules create a text notification and then wake the agent
- heartbeat schedules reuse the same table and mechanism
- heartbeat schedules do not create notifications; they only wake the agent
- heartbeat is created during hiring
- schedules are loaded back into memory at boot

## Execution loop

The execution loop lives in [agent-runner.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner.ts).

Current behavior:

- the runner uses a wake queue from the engine
- an idle agent becomes `running` when an external wake arrives
- while running, the agent executes one Mastra step at a time using `generate([], { maxSteps: 1 })`
- if the result contains no tool calls, the agent returns to `idle`
- if the result contains tool calls, the runner queues the next step
- pacing is contract-aware and cost-aware
- budget insufficiency causes backoff instead of continued execution

## Execution states

Current explicit execution states stored on the agent row:

- `idle`
- `running`

There is no richer long-lived state machine today.

## Current workflow ids

Forge currently exposes two internal workflows:

- `hire-internal-agent`
- `terminate-internal-agent`
