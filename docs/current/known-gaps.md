# Known Gaps

This document records the most important capabilities that are still missing from the current Forge implementation.

It exists to keep the current-state docs honest. The system is already operational as an internal agent runtime, but it is not yet a complete virtual company stack.

## Business operations still missing

### External receivables

Not implemented yet:

- Stripe integration into the company financial system
- Asaas integration into the company financial system
- webhook-driven accounts receivable entries
- payment-to-ledger reconciliation inside Forge

### External payables

Not implemented yet:

- external provider debit ingestion into the company ledger
- infrastructure payable ingestion such as Hetzner
- vendor-level payable tracking beyond manual ledger operations

### Product support intake

Not implemented yet:

- product-facing ticket intake into Forge
- support queue/channel dedicated to product users
- application-to-Forge support event bridge

### Public distribution and marketing access

Not implemented yet:

- social posting integrations
- forum/community participation integrations
- campaign execution surfaces
- public channel monitoring and response loops

### Marketing artifact generation

Not implemented yet:

- image generation as an agent-facing runtime capability
- audio generation/transcription as a runtime capability
- managed creative asset storage for campaigns

## Platform/runtime gaps still open

### Browser capability

Still unimplemented and still investigative:

- browser automation for agents
- stable sandbox-compatible browser execution model

### Generic webhook bus

Still not implemented as a general system.

Current reality:

- GitHub uses adapter-specific endpoints
- Coolify webhook support is not implemented yet
- a generic webhook routing layer remains future work

### Shared knowledge base beyond current memory/workspace setup

Still future work:

- shared cross-agent knowledge base design
- richer retrieval and indexing model beyond current per-agent runtime memory and workspace behavior

## What the current system is already good enough for

Forge is already strong enough for:

- operating persistent internal agents
- coordinating them through GitHub and communication channels
- doing real repository work
- opening PRs and issues
- running contract-based execution loops
- deploying through Coolify
- using email mailboxes per agent
- scheduling follow-up work and heartbeat wakes

## Rule

When one of these gaps becomes implemented, it should stop living only here and move into the relevant document in `docs/current/`.
