# Agent Runner Current Behavior

Status: current implementation reference  
Commit base: `1fec4a5`  
Primary file: [apps/forge/src/agents/agent-runner.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner.ts)

## Purpose

`createAgentRunner(...)` is the orchestration loop for one agent runtime.

It owns:

- wake ingestion through `createAgentWakeQueue(...)`
- run lifecycle transitions between `idle`, `running`, and `absent`
- scheduling the next step under the active contract
- assembling per-step context before `agent.generate(...)`
- persisting usage for each agent step
- handling stop/continue directives returned by the model
- stuck-step detection and automatic recovery
- handing control to long-term memory hooks when the agent enters or leaves idle

It is not a narrow "call generate in a loop" function anymore. It currently mixes lifecycle, scheduling, event flushing, memory decoration, retry, wake draining, and safety logic in one module.

## Imports and direct collaborators

The runner depends directly on:

- `createAgentWakeQueue(...)`
  - receives external events
  - decides when to invoke `execute(events)`
- `createAgentContractStore(...)`
  - execution state persistence
  - contract lookup
  - spend lookup
  - step persistence
- `createSystemSettingsStore(...)`
  - step delay settings
  - communication flush settings
  - memory last-message settings
- `createAgentNotificationStore(...)`
  - creates notifications for stuck loop and stuck step recovery
- `createAgentRunnerUsage(...)`
  - usage extraction
  - step cost estimate
  - persisted accounting
- `formatPendingRunEvents(...)`
  - converts grouped wake events into the textual flush payload
- `RUN_STOP_REMINDER`
  - automatic reminder injected when a step returns no tool calls and does not explicitly request ignore/stop

The runner also calls methods hanging off the runtime:

- `currentRuntime.agent.generate(...)`
- `currentRuntime.agent.hasOwnMemory()`
- `currentRuntime.agent.getMemory()`
- `currentRuntime.onReceiveMessage(...)`
- `currentRuntime.workspace.filesystem`
- `currentRuntime.longTermMemory?.onAgentRunning()`
- `currentRuntime.longTermMemory?.onAgentIdle()`
- `currentRuntime.longTermMemoryRecall?.recallFromStep(...)`
- `currentRuntime.dispose()`

## Constants and thresholds

The current implementation uses the following hard-coded thresholds:

- `ONE_MINUTE_MS = 60_000`
- `TEN_MINUTES_MS = 10 * ONE_MINUTE_MS`
- `FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS`
- `STUCK_LOOP_REPEAT_LIMIT = 6`
- `STEP_HANG_WARNING_MS = 15 minutes`
- `GENERATE_TIMEOUT_MS = 15 minutes`
- `STEP_HANG_RECOVERY_MS = GENERATE_TIMEOUT_MS + 2 minutes`
- `GENERATE_TIMEOUT_MAX_ATTEMPTS = 1`
- `GENERATE_TIMEOUT_BACKOFF_MS = 5_000`
- `RUNNER_AWAIT_TIMEOUT_MS = 30_000`
- `CONTEXT_DECORATION_TIMEOUT_MS = 5_000`
- `RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000`
- `DEFAULT_RUN_LAST_MESSAGES = 20`
- `AGENT_CONTEXT_FILE_PATH = 'AGENT_CONTEXT.md'`
- `AGENT_CONTEXT_WARNING_CHAR_LIMIT = 8_000`
- `WORKING_MEMORY_WARNING_CHAR_LIMIT = 4_000`
- `NO_ACTION_NEEDED_PREFIX = 'NO_ACTION_NEEDED'`
- `STOP_AND_IDLE_PREFIX = 'STOP_AND_IDLE'`

These thresholds are used in different parts of the flow:

- scheduling and retry
- timeout wrapping around persistence and generate calls
- memory pressure warnings injected into system prompt
- runner control detection from model output

## Mutable runner state

The runner keeps a large amount of local mutable state inside the closure.

### Runtime and collaborator state

- `currentRuntime`
  - the runtime currently bound to the runner
  - may be replaced by `reloadRuntimeForNewRun(...)`
- `usage`
  - recreated when runtime is reloaded
- `wakeQueue`
  - one wake queue per runner

### Timers

- `timer`
  - timeout for the next step
- `healthcheckTimer`
  - repeating interval every `30s`

### Lifecycle flags

- `stopped`
- `instant`
  - causes the next scheduled delay to be `0`
  - set when a new run begins
- `startingRun`
- `executing`

### Retry and timing state

- `backoffMs`
  - exponential backoff base
- `nextStepAt`
- `lastWakeStartedAt`
- `lastStepStartedAt`
- `lastStepStage`

### Loop detection state

- `lastLoopSignature`
- `repeatedLoopCount`

### Epoch / invalidation state

- `activeRunEpoch`
- `activeStepEpoch`
- `activeGenerateToken`

These are used to invalidate older async work and to avoid stale continuations after stop, idle transition, or run replacement.

### Generate identity state

- `activeRunId`
  - generated with `crypto.randomUUID()` when a run begins
  - passed to `agent.generate(...)`
- `currentGenerateAbortController`
  - active only while a generate attempt is in flight

### Memory window state

- `runLastMessages`
  - either `null` for "full history mode"
  - or a number passed to `memory.options.lastMessages`

### LTM recall carry-over state

- `pendingLongTermMemoryRecallSystemText`
  - holds the recall result produced after one step
  - consumed on the following step as extra system text

### Flush state

- `flushedRunEventKeys`
  - tracks which pending events were already flushed inside the current run
- `currentFlushSettings`
  - DM/group communication flush toggles loaded from system settings
- `pendingRunMessages`
  - `Map<string, AgentWakeEvent>`
  - the local buffer of wake events waiting to be flushed into a step

## Entry point: factory creation

`createAgentRunner(...)`:

1. creates store and collaborator instances
2. captures the initial runtime
3. creates a wake queue whose `execute` callback is the runner's own `execute(events)` function
4. registers `currentRuntime.onReceiveMessage(notifyExternalEvent)`
5. returns:
   - `start`
   - `stop`
   - `forceIdle`
   - `execute`
   - `getSnapshot`
   - `notifyExternalEvent`

## Start behavior

`start()` performs runner boot.

Flow:

1. returns immediately if `stopped`
2. starts the periodic healthcheck
3. loads current flush settings
4. reads persisted execution state from the store

Then it branches:

- if persisted state is `idle`
  - calls `currentRuntime.longTermMemory?.onAgentIdle()`
  - returns
- if persisted state is `absent`
  - starts a run immediately with:
    - `reloadRuntime: false`
    - `markRunning: true`
- otherwise
  - starts a run immediately with:
    - `reloadRuntime: false`
    - `markRunning: false`

The last branch means `start()` trusts that a non-idle persisted state implies the runner should resume the run path.

## Wake ingestion

There are two wake entry points:

- the external wake queue invoking `execute(events)`
- direct runtime message callbacks invoking `notifyExternalEvent(event)`

### `notifyExternalEvent(event)`

This is the low-level hook used when the runtime itself emits an event.

Flow:

1. returns if `stopped`
2. forwards the event into `wakeQueue.notifyExternalEvent(event)`
3. if `event.idleOnly` and the runner is locally idle
   - immediately calls `wakeQueue.onRunnerIdle()`

This means idle-only events can be re-evaluated for dispatch without waiting for some other state change.

### `execute(events)`

This is the wake queue's callback into the runner.

Flow:

1. returns if `stopped`
2. loads persisted execution state
3. splits incoming events into:
   - `idleOnlyEvents`
   - `runnableEvents`

Branch:

- if persisted state is not `idle`, or `startingRun` is already true:
  - append non-idle-only events into `pendingRunMessages`
  - requeue each idle-only event back through `wakeQueue.notifyExternalEvent(event)`
  - return

- otherwise:
  - append non-idle-only events into `pendingRunMessages`
  - append idle-only events too, but force them into pending run messages with `allowIdleOnly: true`
  - start a new run with:
    - `reloadRuntime: true`
    - `markRunning: true`
    - `wakeStartedAt: Date.now()`

Important detail:

- `idleOnly` events are not discarded
- when a new run is being started from idle, they are converted into normal flushable pending events

## Pending run message buffering and flushing

### `appendPendingRunMessages(events, options)`

This function loads wake events into `pendingRunMessages`.

Rules:

- drops idle-only events unless `allowIdleOnly` is true
- drops blank text events
- keys by `event.idempotencyKey`
- normalizes:
  - `originIdleOnly`
  - `idleOnly`

`originIdleOnly` is preserved so the flush path can still distinguish events that originally required an idle agent.

### `flushPendingRunMessages(options)`

This function converts buffered events into a single textual payload.

Flow:

1. returns `null` if map is empty
2. sorts all pending events by timestamp
3. builds `deferredEvents`
4. filters all events with these rules:
   - skip if already in `flushedRunEventKeys`
   - if `originIdleOnly` and `allowOriginIdleOnly` is false:
     - move to `deferredEvents`
     - do not flush now
   - otherwise check `shouldIncludePendingRunEventInFlush(event)`

5. clears `pendingRunMessages`
6. re-adds only `deferredEvents`
7. if no flushable events remain:
   - returns `null`
8. marks flushed event keys in `flushedRunEventKeys`
9. increments `runLastMessages`
10. returns `formatPendingRunEvents(events)`

### Flush formatting

The actual string shape comes from [apps/forge/src/agents/agent-runner-wake.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner-wake.ts).

Behavior:

- events are grouped by `groupKey`
- groups are formatted with a group header
- each item becomes a line or multiline block
- message groups include:
  - `targetKey`
  - optional `conversationType`
  - optional `conversationName`
  - optional `participants`
- schedule groups become:
  - `scheduler`
  - or `scheduler: <ScheduleId>`
- GitHub groups become:
  - `GitHub: <EventType>`
- runner reminder becomes:
  - `System: runner-reminder`

Each event line may include:

- `[HH:MM]`
- `[messageId: ...]`
- author name and key
- attachments suffix

The runner currently injects the final flush result into `generate(...)` as a `user` message, not as callback feedback.

## Stop behavior

`stop()` is the hard shutdown path for the runner instance.

It:

- sets `stopped = true`
- clears `startingRun`
- increments `activeRunEpoch`
- zeroes `activeStepEpoch`
- clears `activeRunId`
- invalidates in-flight generate
- clears `executing`
- clears timer and healthcheck
- stops wake queue
- resets flushed event key tracking

It does not persist a new execution state by itself.

## Forced idle behavior

`forceIdle(options)`

This is a more operational reset path than `transitionToIdle(...)`.

It:

1. starts a new run epoch
2. clears `startingRun`, `executing`, timer
3. optionally keeps queued work if `preserveQueuedWork` is true
4. otherwise:
   - stops wake queue
   - clears pending run messages
5. resets flushed event keys
6. clears `instant`
7. resets loop detector
8. persists execution state as `idle`
9. notifies LTM `onAgentIdle()`
10. clears runtime timing markers if the run epoch is still current

This is used by stuck-step auto-recovery before the runner sends an auto-rewakeup event.

## Healthcheck loop

The runner keeps a `setInterval` healthcheck every `30s`.

### `runHealthcheck()`

Flow:

1. returns if `stopped`
2. loads persisted execution state

If persisted state is `idle`:

- if runner is not locally idle, return
- if there are pending run messages:
  - immediately begin a new run with runtime reload
- otherwise:
  - inspect wake queue snapshot
  - if wake queue says `pending` or `waitingForIdle`
    - call `wakeQueue.onRunnerIdle()`

If persisted state is not `idle`:

- if `startingRun`, `executing`, or `timer` is active:
  - return
- otherwise call `queueNextStep(activeRunEpoch)`

This means the healthcheck acts as a liveness repair path for:

- idle runners that have buffered work but no active run
- non-idle runners that have no current timer and no current step in flight

## Beginning a run

### `beginRun(input)`

This is the main run initialization function.

It returns immediately if:

- `stopped`
- `startingRun`

Then it:

1. sets `startingRun = true`
2. starts a new run epoch
3. generates a new `activeRunId`
4. sets `instant = true`
5. resets backoff to one minute
6. stores `lastWakeStartedAt`
7. resets loop detector
8. resets flushed event key tracking
9. clears pending LTM recall carry-over
10. refreshes run flush settings
11. resets `runLastMessages`

Then:

- optionally reloads runtime via `reloadRuntimeForNewRun(runEpoch)`
- aborts if run became stale
- calls `currentRuntime.longTermMemory?.onAgentRunning()`
- optionally persists execution state `running`
- aborts if stale again
- enters `queueNextStep(runEpoch)`

On failure:

- logs error
- if run is still current, transitions to idle

Finally:

- `startingRun = false`

### Runtime reload path

`reloadRuntimeForNewRun(runEpoch)`:

1. returns if no `options.reloadRuntime`
2. holds previous runtime
3. resolves `options.reloadRuntime()` under timeout
4. if run became stale:
   - disposes the newly loaded runtime
   - returns
5. swaps `currentRuntime`
6. recreates `usage`
7. rebinds `onReceiveMessage(notifyExternalEvent)`
8. calls `options.onRuntimeReloaded?.(...)`
9. disposes the previous runtime

This means runtime reload is explicit at run boundaries only.

## Scheduling and next-step planning

### `queueNextStep(runEpoch)`

This is the decision point that chooses between:

- do nothing
- transition to idle
- schedule a delayed step
- schedule an immediate step

It returns immediately if:

- `stopped`
- `executing`
- `timer` already exists
- run is stale

Then it:

1. loads persisted execution state
2. returns if execution state is `idle` or run stale
3. calls `planNextAttempt()`

`planNextAttempt()` can return:

- `{ execute: 'idle' }`
- `{ execute: false, delayMs }`
- `{ execute: true, contractId, delayMs }`

Current implementation detail:

- the `execute: false` branch exists in the type but is not currently emitted by `planNextAttempt()`
- today the actual outcomes are effectively only:
  - idle
  - execute now or later

If planner returns idle:

- clear `instant`
- `transitionToIdle(runEpoch)`

If planner returns a non-executing delay:

- clear `instant`
- call `schedule(delayMs)`

If planner returns execute:

- clear `instant`
- store `nextStepAt`
- set `timer`
- when timer fires:
  - clear timer
  - clear `nextStepAt`
  - call `executeStep(contractId, runEpoch)`

Errors in scheduling:

- are logged
- cause a retry using exponential backoff via `schedule(nextBackoff())`

### `planNextAttempt()`

Planner flow:

1. load runnable contract
2. if none:
   - return idle
3. load current contract spend
4. compute remaining budget
5. call `usage.estimateStepCostUsd()`
6. if estimate exists and remaining budget is below it:
   - return idle
7. reset backoff to one minute
8. load system settings
9. return execute with:
   - current contract id
   - delay

Delay calculation:

- if `instant` is true: `0`
- if `stepDelayEnabled` is false: `0`
- otherwise use `calculateDelayMs(...)`

### `calculateDelayMs(...)`

Formula:

1. if estimated step cost is `null` or `<= 0`, return `0`
2. `remainingTimeMs = endsAt - Date.now()`
3. `stepsPossible = remainingBudgetUsd / estimatedStepUsd`
4. if remaining time or steps possible is `<= 0`, return `0`
5. return `remainingTimeMs / stepsPossible`

This is contract pacing, not a fixed step interval.

### Usage estimate source

In [apps/forge/src/agents/agent-runner-usage.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner-usage.ts):

- recent step window: `10`
- if pricing is unavailable:
  - use average of persisted `costUsd`
- if pricing exists:
  - average `inputTokens`
  - average `cachedInputTokens`
  - average `outputTokens`
  - derive uncached input as `input - cached`
  - multiply by model price columns
  - then multiply by contract multiplier

## Step execution

### `executeStep(contractId, runEpoch)`

This is the core run loop body.

It returns immediately if:

- `stopped`
- `executing`
- run is stale

Then it:

1. sets `executing = true`
2. stores `activeStepEpoch = runEpoch`
3. initializes local control flags:
   - `continueRunning`
   - `drainWakeQueueAfterStep`
   - `suppressNoToolCallReminder`
   - `prompt`
4. sets `lastStepStartedAt`
5. sets `lastStepStage = 'step-started'`
6. starts:
   - warning timer at `15 min`
   - recovery timer at `17 min`

### Step preconditions

The step then:

1. loads persisted execution state
2. returns if it is `idle` or run stale
3. if persisted state is `absent`
   - sets it back to `running`

Then:

4. loads runnable contract
5. if run stale, return
6. if no contract:
   - transition to idle with `deferWakeQueueDrain: true`
   - set `drainWakeQueueAfterStep = true`
   - return
7. if loaded contract id differs from scheduled one:
   - queue next step
   - return

### Step input assembly

Current step input is composed from three sources:

1. `stepLongTermMemoryRecallSystemText`
   - taken from `pendingLongTermMemoryRecallSystemText`
   - then immediately cleared
2. `prompt`
   - result of `flushPendingRunMessages({ allowOriginIdleOnly: true }) ?? ''`
3. `systemPrompt`
   - created later inside `generateWithTimeoutRetries(...)`

Important behavior:

- flush happens on every step
- there is no longer a "flush only on first step of the run" rule
- flush text is injected into generate as a `user` message array if non-empty

### Generate execution

`generateWithTimeoutRetries(promptText, runEpoch, longTermMemoryRecallSystemText)`

Current implementation:

- trims `promptText`
- if non-empty:
  - creates:
    ```ts
    [{ role: 'user', content: promptText.trim() }];
    ```
- otherwise uses `[]`

For each attempt:

1. creates a new `AbortController`
2. marks current generate token via `startGenerateAttempt(controller)`
3. creates timeout promise with `createGenerateTimeoutPromise(controller)`
4. loads `agentContextInstructions`
5. builds `systemPrompt` from:
   - `agentContextInstructions`
   - `longTermMemoryRecallSystemText`
6. calls `currentRuntime.agent.generate(...)`
7. races generate against timeout promise

Current options passed to `generate(...)`:

- `runId: activeRunId ?? \`${runtime.id}:${runEpoch}\``
- `savePerStep: true`
- `maxSteps: 1`
- `abortSignal: controller.signal`
- `system: systemPrompt` if non-empty
- `memory.thread = currentRuntime.mastraId`
- `memory.resource = currentRuntime.mastraId`
- `memory.options.lastMessages = runLastMessages` unless `runLastMessages === null`
- `providerOptions.anthropic.thinking = { type: 'enabled', budgetTokens: 2000 }`

Timeout behavior:

- current max attempts is `1`
- timeout helper still exists as a loop structure, but there is effectively no retry cycle today because attempt count is one

### System prompt assembly

`buildStepSystemPrompt(...)` concatenates:

- `agentContextInstructions`
- `longTermMemoryRecallSystemText`

Both are joined with blank lines if present.

### Agent context loading

`loadAgentContextInstructions()`:

1. loads `AGENT_CONTEXT.md` if it exists
2. loads pressure signals
3. if no file content:
   - returns only pressure warnings or `undefined`
4. otherwise builds a block that says:
   - this file was auto-loaded
   - it should be treated as runtime instructions and context
   - it is the only auto-loaded workspace file
   - it should remain concise
   - then appends actual file content

### Pressure warnings

`loadContextPressureSignals(...)`:

- warns when `AGENT_CONTEXT.md` exceeds `8,000` chars
- warns when working memory exceeds `4,000` chars

Working memory is read only if the runtime agent reports it has its own memory.

## Post-generate processing

After generate returns:

1. logs tool calls
2. extracts token usage
3. records one persisted `agent-step`
4. triggers observational memory usage recording asynchronously
   - current implementation is a stub and does nothing

Then it computes:

- `controlDirective`
- `ignoredTextRequested`
- `stopRequested`
- `workingMemoryUpdated`
- `loopSignature`

### Usage extraction

`getUsageFromResult(...)` currently interprets provider usage as:

- `cachedInputTokens = inputTokenDetails.cacheReadTokens ?? cachedInputTokens ?? 0`
- `inputTokens = inputTokens ?? promptTokens ?? 0`
- `outputTokens = outputTokens ?? completionTokens ?? 0`

### Recording step cost

`recordAgentStep(...)` persists:

- input tokens
- cached input tokens
- output tokens
- model price columns
- contract multiplier
- computed `costUsd`

Cost formula:

- uncached input tokens are `input - cached`
- cached input tokens are charged separately
- output tokens are charged separately

## Runner control directives

### Directive extraction

`extractRunnerControlDirective(result)` examines:

- `result.text`
- all text parts collected from `result.steps[*].response.uiMessages[*].parts[*]`

It searches for exact full-line matches:

- `STOP_AND_IDLE`
- `NO_ACTION_NEEDED`

Priority:

- if any exact `STOP_AND_IDLE` exists: return `stop`
- else if any exact `NO_ACTION_NEEDED` exists: return `ignore`
- else `null`

### Working memory update side effect

If any tool call is named `updateWorkingMemory`, the runner appends a synthetic pending event describing that working memory was updated.

That event is then eligible to be flushed into a future step.

## Loop detection

The loop signature is:

- trimmed `result.text`
- all tool calls with tool name and args

If the same signature repeats `6` times:

1. create a notification
2. clear `nextStepAt`
3. reset loop detector
4. transition to idle with deferred wake drain
5. return

This is one of the safety stops inside the runner.

## Stop / reminder behavior

### Stop behavior

If `stopRequested` and `pendingRunMessages.size === 0`:

1. clear `nextStepAt`
2. reset loop detector
3. transition to idle with deferred wake drain
4. set `drainWakeQueueAfterStep = true`
5. return

Important current rule:

- `STOP_AND_IDLE` only actually idles the runner when there is no buffered pending run message at that moment

### No-tool-call reminder behavior

If `result.toolCalls.length === 0`:

- if directive was `ignore`
  - suppress reminder
- otherwise if directive was not `stop`
  - append a `runner-reminder` event containing `RUN_STOP_REMINDER`

This means plain text without tools does not automatically stop the run.

It usually creates another pending message that will be flushed into the next step.

## Long-term memory recall handoff

At the end of a successful step, the runner calls:

`currentRuntime.longTermMemoryRecall?.recallFromStep({...})`

Arguments:

- `step: result.steps.at(-1) ?? null`
- `steps: result.steps`
- `threadId: currentRuntime.mastraId`
- `resourceId: currentRuntime.mastraId`

Its return value is stored in:

- `pendingLongTermMemoryRecallSystemText`

That value is not used in the current step.
It is consumed by the next step as part of the generated `systemPrompt`.

So the recall flow is:

1. step finishes
2. recall runs from the finished step
3. recall result is cached in runner state
4. next step receives it in system prompt
5. runner clears the cached value before generating

## Successful step completion

On success, before leaving `try`:

- `backoffMs = ONE_MINUTE_MS`
- `continueRunning = true`

In `finally`:

- warning timers are cleared
- `lastStepStartedAt = null`
- `lastStepStage = null`
- if this is still the active step epoch:
  - `activeStepEpoch = 0`
  - `executing = false`
- if wake drain was requested:
  - call `wakeQueue.onRunnerIdle()`
- if `continueRunning` and run is current:
  - call `queueNextStep(runEpoch)`

This means the next step is not executed inline.
It is always re-entered through scheduling logic.

## Error behavior and absent state

Any error inside `executeStep(...)` enters the `catch`.

The runner then:

1. skips if run is stale
2. logs a structured error payload
3. calls `store.setExecutionAbsent(runtime.id, formatAbsentExecutionError(...))`
4. schedules retry using `schedule(nextBackoff())`

### What absent means in practice

Current behavior is:

- the run is not terminated
- no wake drain occurs
- a timer is scheduled using exponential backoff
- on the next actual step attempt, if persisted state is still `absent`, runner sets it back to `running`

So `absent` is being used as a visible retry/backoff state inside the same continuing run.

### Absent error formatting

`formatAbsentExecutionError(...)` includes:

- stage line
- error name and message
- extra details if present:
  - `statusCode`
  - `statusText`
  - `url`
  - `responseBody`
  - `body`
  - `data`
  - `value`
  - `cause`

Values are truncated to about `2,000` chars each.

## Backoff behavior

`nextBackoff()`:

- returns current `backoffMs`
- doubles it
- caps at `10 minutes`

Backoff is reset to `1 minute`:

- when a new run begins
- when planner sees a contract and prepares an execute path
- after a successful step

## Stuck step warning and auto-recovery

Each executing step installs two timers:

- warning timer at `15 min`
- recovery timer at `17 min`

### Warning timer

Only logs a diagnostic payload with:

- agent ids
- model info
- prompt
- snapshot
- thresholds

### Recovery timer

`recoverStuckStep(...)`:

1. aborts if run is stale or no longer executing
2. logs a detailed recovery payload
3. creates a notification
4. calls `forceIdle({ preserveQueuedWork: true })`
5. emits a synthetic `runner-auto-rewakeup` event through `notifyExternalEvent(...)`

That synthetic event says:

- auto-rewakeup after stuck step
- rebuild context from latest persisted state
- continue work

So stuck-step recovery currently forces:

- idle
- then an immediate new wake event

## Epoch and generate invalidation

### `startNewRunEpoch()`

This:

- increments `activeRunEpoch`
- clears `activeStepEpoch`
- invalidates in-flight generate

Used when:

- beginning a new run
- forcing idle

### `invalidateInFlightGenerate()`

This:

- increments `activeGenerateToken`
- aborts current generate controller if present
- clears the controller reference

### `startGenerateAttempt(...)` / `finishGenerateAttempt(...)`

Used to ensure only the latest generate attempt owns `currentGenerateAbortController`.

`finishGenerateAttempt(...)`:

- aborts the controller
- only clears `currentGenerateAbortController` if the token still matches

## `runLastMessages` behavior

### Reset

At run start:

- load system settings
- if `memoryLastMessagesFullEnabled` is true:
  - `runLastMessages = null`
- else:
  - `runLastMessages = settings.memoryLastMessagesCount || DEFAULT_RUN_LAST_MESSAGES`

### Increment

Only increments when `flushPendingRunMessages(...)` actually flushes events.

Current behavior means:

- run history window grows when flushing inserts new user messages
- it does not grow automatically on every step

## Snapshot shape

`getSnapshot()` returns:

- `stopped`
- `instant`
- `startingRun`
- `executing`
- `activeRunEpoch`
- `activeStepEpoch`
- `scheduled`
- `backoffMs`
- `nextStepAt`
- `estimatedDelayMs`
- `lastStepStartedAt`
- `lastStepStage`
- `pendingRunEvents`
- `wake`
- `lastWakeStartedAt`

This is a local runner snapshot, not a fully persisted source of truth.

## Current structural observations

This section does not propose changes yet. It only names the current shape of the implementation.

### Responsibility mixing

The runner currently mixes:

- wake ingestion
- buffered event formatting
- generate input assembly
- contract pacing
- retry state
- absent state transitions
- LTM recall carry-over
- stuck-step recovery
- loop detection
- memory pressure decoration

inside a single closure and mostly inside one main step path.

### State spread

The run state is split across:

- database execution state
- local booleans
- local timers
- local epoch counters
- local buffered pending events
- local LTM recall carry-over

This means some behavior is decided from persisted state and some from closure-local state.

### Input assembly layering

A single step currently may receive input from:

- pending run flush as a `user` message
- `AGENT_CONTEXT.md`
- context pressure warnings
- LTM recall text
- Mastra memory history controlled by `lastMessages`

That assembly is distributed across:

- `executeStep(...)`
- `generateWithTimeoutRetries(...)`
- `loadAgentContextInstructions(...)`
- `buildStepSystemPrompt(...)`

### Retry semantics

`absent` is not a terminal failed state in the runner.
It is currently a retry/backoff state that still belongs to the active run.

### Reminder semantics

No-tool-call text does not stop by itself.
It commonly feeds a synthetic reminder event back into the next step.

## Files directly relevant to understanding the current runner

- [apps/forge/src/agents/agent-runner.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner.ts)
- [apps/forge/src/agents/agent-runner-wake.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner-wake.ts)
- [apps/forge/src/agents/agent-runner-usage.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner-usage.ts)
- [apps/forge/src/agents/agent-contract-store.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-contract-store.ts)
- [apps/forge/src/agents/agent-runtime-types.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runtime-types.ts)

## Scope of this document

This document is intentionally descriptive, not corrective.

It describes:

- what the runner currently does
- how the current flow is wired
- what state exists
- what each branch is responsible for

It does not yet define the target refactor or target execution model.
